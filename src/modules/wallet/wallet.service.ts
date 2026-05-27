import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MonnifyService } from '../monnify/monnify.service';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

// Documents
import { WalletDocument } from './schemas/wallet.schema';
import { PaymentService } from '../payment/payment.service';
import { TransactionService } from '../transaction/transaction.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  constructor(
    @InjectModel('Wallet') private readonly walletModel: Model<WalletDocument>,
    private readonly monnify: MonnifyService,
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
    private readonly usersService: UsersService,
  ) {}

  private async ensureWallet(userId: string) {
    const w = await this.walletModel.findOne({ userId });
    if (w) return w;
    return this.createWalletForUser(userId, true);
  }

  async setPin(userId: string, pin: string) {
    if (!/^[0-9]{4}$/.test(String(pin)))
      throw new BadRequestException('PIN must be a 4-digit number');
    const wallet = await this.ensureWallet(userId);
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(String(pin), salt);
    await this.walletModel.updateOne({ _id: wallet._id }, { $set: { pinHash: hash } });
    return { ok: true };
  }

  private async verifyPinHash(pin: string, hash?: string) {
    if (!hash) return false;
    return bcrypt.compare(String(pin), hash);
  }

  async transfer(
    fromUserId: string,
    driverTagNumber: string,
    amount: number,
    remark?: string,
    pin?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const senderWallet = await this.walletModel.findOne({ userId: fromUserId });
    if (!senderWallet) throw new NotFoundException('Sender wallet not found');
    if (!senderWallet.pinHash) throw new BadRequestException('Wallet PIN not set');
    const ok = await this.verifyPinHash(pin || '', senderWallet.pinHash);
    if (!ok) throw new BadRequestException('Invalid PIN');

    const driver = await this.usersService.findByDriverTagNumber(driverTagNumber);
    if (!driver) throw new NotFoundException('Driver not found');

    const receiverWallet = await this.ensureWallet(String(driver._id));

    if (Number(senderWallet.balance) < amount)
      throw new BadRequestException('Insufficient funds');

    // perform balance updates
    await this.walletModel.findByIdAndUpdate(senderWallet._id, { $inc: { balance: -amount } });
    await this.walletModel.findByIdAndUpdate(receiverWallet._id, { $inc: { balance: amount } });

    // create transaction records: DEBIT for sender, TOPUP for receiver
    await this.transactionService.createTransaction({
      type: 'DEBIT',
      userId: fromUserId,
      walletId: String(senderWallet._id),
      amount,
      metadata: { remark, transferToDriverTag: driverTagNumber },
      toUserId: String(driver._id),
      toWalletId: String(receiverWallet._id),
    } as any);

    await this.transactionService.createTransaction({
      type: 'TOPUP',
      userId: String(driver._id),
      walletId: String(receiverWallet._id),
      amount,
      metadata: { remark, transferFromUser: fromUserId },
      toUserId: fromUserId,
      toWalletId: String(senderWallet._id),
    } as any);

    return { ok: true };
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.walletModel.findOne({ userId }).lean();
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.transactionService.findByWalletId(String(wallet._id), page, limit);
  }

  async topUp(
    userId: string,
    amount: number,
    method: 'bank' | 'ussd' | 'card',
    opts: any = {},
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    // get user customer info (user is stored in Users collection)
    // we only reference userId (MongoDB _id) here; caller should supply valid ObjectId string
    const customer = { name: userId, email: `${userId}@example.com` };

    const wallet = await this.walletModel.findOne({ userId }).lean();

    // initialize transaction with provider
    const init = await this.monnify.initializeTransaction(
      userId,
      amount,
      customer,
    );
    console.log({ reference: init.providerResponse.responseBody });

    const transactionReference =
      init.providerResponse.responseBody.transactionReference;

    // persist pending payment
    await this.paymentService.createPending({
      provider: 'MONNIFY',
      providerReference: transactionReference,
      userId,
      amount,
      metadata: { method },
    });

    // Branch by method
    switch (method) {
      case 'bank':
      case 'ussd': {
        const bankCode = wallet?.bankCode;
        if (!bankCode)
          throw new BadRequestException(
            'bankCode is required for bank/ussd payments',
          );
        const resp = await this.monnify.initBankPayment(
          transactionReference,
          bankCode,
        );
        // attach provider data to payment
        await this.paymentService.updateMetadata(transactionReference, {
          ...resp.raw,
          method,
        });
        return { transactionReference, ...resp };
      }
      case 'card': {
        const card = opts.card;
        const deviceInformation = opts.deviceInformation;
        if (!card)
          throw new BadRequestException(
            'card details required for card payments',
          );
        const resp = await this.monnify.chargeCard(
          transactionReference,
          card,
          deviceInformation,
        );
        await this.paymentService.updateMetadata(transactionReference, {
          ...resp.raw,
          method,
          tokenId: resp.tokenId,
        });
        return { transactionReference, ...resp };
      }
      default:
        throw new BadRequestException('Unsupported payment method');
    }
  }

  async authorizeCardOtp(
    transactionReference: string | undefined,
    tokenId: string,
    token: string,
  ) {
    // transactionReference corresponds to our payment.providerReference
    if (!tokenId || !token)
      throw new BadRequestException('tokenId and token are required');

    const txRef = transactionReference;
    let payment = null;
    if (txRef) {
      payment = await this.paymentService.findByProviderReference(txRef);
      if (!payment)
        throw new NotFoundException(
          'Payment not found for transactionReference',
        );
    }

    const resp = await this.monnify.authorizeCardOtp(tokenId, token, txRef);
    // persist provider response
    if (txRef) {
      await this.paymentService.updateMetadata(txRef, {
        ...(payment?.metadata || {}),
        ...(resp.raw || {}),
      });
    }

    // if provider indicates success, credit wallet
    const providerRef = resp.providerReference || txRef;
    if (resp.status && String(resp.status).toUpperCase().includes('SUCCESS')) {
      // find payment to get userId and amount
      const p = txRef
        ? payment
        : await this.paymentService.findByProviderReference(providerRef);
      if (p) {
        await this.processProviderPayment(
          providerRef,
          p.userId,
          Number(p.amount),
        );
      }
    }

    return { providerRef, status: resp.status, raw: resp.raw };
  }

  async getBanks() {
    return this.monnify.getBanks();
  }

  async createWalletForUser(userId: string, skipProvider = false) {
    const existing = await this.walletModel.findOne({ userId }).lean();
    if (existing) return existing;

    // If caller requests to skip provider (development/testing), create local wallet first and try provider non-blocking
    if (skipProvider) {
      const wallet = await this.walletModel.create({ userId });
      try {
        // fetch user info to enrich provider payload
        // Caller should supply user details if needed; default to userId
        const customer = { name: userId };
        const ra = await this.monnify.createReservedAccount(userId, customer);
        if (ra && ra.accountNumber) {
          await this.walletModel.updateOne(
            { _id: wallet._id },
            {
              $set: {
                accountNumber: ra.accountNumber,
                accountName: ra.accountName,
                bankName: ra.bankName,
                bankCode: ra.bankCode,
                providerAccountReference: ra.accountReference,
              },
            },
          );
        }
      } catch (e) {
        this.logger.warn(
          'Failed to create Monnify reserved account for user (skipProvider mode)',
          userId,
          e,
        );
      }
      return wallet;
    }

    // Strict path: require provider reserved account first, then persist local wallet with provider details
    this.logger.debug(
      'Creating provider reserved account before local wallet for',
      userId,
    );
    // fetch user info and include customer name/email in provider request
    const customer = { name: userId };
    const ra = await this.monnify.createReservedAccount(userId, customer);
    if (!ra || !ra.accountNumber) {
      this.logger.error('Monnify did not return accountNumber', ra);
      throw new Error('Failed to create provider reserved account');
    }

    const wallet = await this.walletModel.create({
      userId,
      accountNumber: ra.accountNumber,
      accountName: ra.accountName,
      bankName: ra.bankName,
      bankCode: ra.bankCode,
      providerAccountReference: ra.accountReference,
    });

    return wallet;
  }

  async getBalance(userId: string) {
    const wallet = await this.walletModel.findOne({ userId }).lean();
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet.balance;
  }

  async getWalletDetails(userId: string) {
    const wallet = await this.walletModel.findOne({ userId }).lean();
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.paymentService.findByProviderReference; // placeholder to keep types
    // fetch payments and transactions via services
    const paymentsList = await this.paymentService.findByUserId(userId);
    const transactions = await this.transactionService.findByWalletId(
      String(wallet._id),
    );
    return { wallet, payments: paymentsList, transactions };
  }

  async credit(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const wallet = await this.createWalletForUser(userId);
    const updated = await this.walletModel
      .findByIdAndUpdate(
        wallet._id,
        { $inc: { balance: amount } },
        { new: true },
      )
      .lean();
    // create transaction record for TOPUP
    await this.transactionService.createTransaction({
      type: 'TOPUP',
      userId,
      walletId: String(wallet._id),
      amount,
    });
    return updated;
  }

  async debit(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const wallet = await this.walletModel.findOne({ userId });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (Number(wallet.balance) < amount)
      throw new BadRequestException('Insufficient funds');
    const updated = await this.walletModel
      .findByIdAndUpdate(
        wallet._id,
        { $inc: { balance: -amount } },
        { new: true },
      )
      .lean();
    // create transaction record for DEBIT
    await this.transactionService.createTransaction({
      type: 'DEBIT',
      userId,
      walletId: String(wallet._id),
      amount,
    });
    return updated;
  }

  async deposit(userId: string, amount: number) {
    // keep method name for compatibility but delegate to Monnify
    const customer = { name: userId, email: `${userId}@example.com` };
    const init = await this.monnify.initializeTransaction(
      userId,
      amount,
      customer,
    );

    // record a pending payment in DB to allow idempotent webhook handling
    await this.paymentService.createPending({
      provider: 'MONNIFY',
      providerReference: init.paymentReference,
      userId,
      amount,
    });

    return init;
  }

  async processProviderPayment(
    providerReference: string,
    userId: string,
    amount: number,
    provider = 'MONNIFY',
  ) {
    if (!providerReference)
      throw new BadRequestException('Missing provider reference');
    // Mark payment as success (creates if missing)
    const payment = await this.paymentService.markSuccess(
      providerReference,
      amount,
      provider,
      userId,
    );

    // credit the wallet
    await this.credit(userId, amount);

    // create transaction linked to payment
    const wallet = await this.walletModel.findOne({ userId }).lean();
    if (wallet) {
      await this.transactionService.createTransaction({
        type: 'TOPUP',
        userId,
        walletId: String(wallet._id),
        amount,
        paymentId: String((payment as any)._id),
        providerReference,
      });
    }

    return payment;
  }
}
