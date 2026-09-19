import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MonnifyService } from '../monnify/monnify.service';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { WalletDocument } from './schemas/wallet.schema';
import { PaymentService } from '../payment/payment.service';
import { TransactionService } from '../transaction/transaction.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

const MIN_WITHDRAWAL_AMOUNT = 100;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  constructor(
    @InjectModel('Wallet') private readonly walletModel: Model<WalletDocument>,
    private readonly monnify: MonnifyService,
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogService: ActivityLogService,
    @Inject(forwardRef(() => UsersService))
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
    await this.walletModel.updateOne(
      { _id: wallet._id },
      { $set: { pinHash: hash } },
    );
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
    if (!senderWallet.pinHash)
      throw new BadRequestException('Wallet PIN not set');
    const ok = await this.verifyPinHash(pin || '', senderWallet.pinHash);
    if (!ok) throw new BadRequestException('Invalid PIN');

    const driver =
      await this.usersService.findByDriverTagNumber(driverTagNumber);
    if (!driver) throw new NotFoundException('Driver not found');

    const receiverWallet = await this.ensureWallet(String(driver._id));

    if (Number(senderWallet.balance) < amount)
      throw new BadRequestException('Insufficient funds');

    await this.walletModel.findByIdAndUpdate(senderWallet._id, {
      $inc: { balance: -amount },
    });
    await this.walletModel.findByIdAndUpdate(receiverWallet._id, {
      $inc: { balance: amount },
    });

    await this.transactionService.createTransaction({
      type: 'TRANSFER',
      userId: fromUserId,
      walletId: String(senderWallet._id),
      amount,
      metadata: {
        remark,
        direction: 'OUT',
        transferToDriverTag: driverTagNumber,
      },
      toUserId: String(driver._id),
      toWalletId: String(receiverWallet._id),
    } as any);

    await this.transactionService.createTransaction({
      type: 'TRANSFER',
      userId: String(driver._id),
      walletId: String(receiverWallet._id),
      amount,
      metadata: { remark, direction: 'IN', transferFromUser: fromUserId },
      toUserId: fromUserId,
      toWalletId: String(senderWallet._id),
    } as any);

    await this.notifyAndLog(
      fromUserId,
      'WALLET_DEBIT',
      'WALLET_TRANSFER',
      'Wallet transfer sent',
      `You sent ${amount} to driver ${driverTagNumber}`,
      { amount, driverTagNumber },
    );
    await this.notifyAndLog(
      String(driver._id),
      'WALLET_CREDIT',
      'WALLET_TRANSFER',
      'Wallet transfer received',
      `You received ${amount} from a wallet transfer`,
      { amount, fromUserId },
    );

    return { ok: true };
  }

  /**
   * Settles a completed trip: debits the passenger's wallet and credits the
   * driver's wallet, tagging both transaction records with the trip id so
   * earnings/spendings can be derived from either the Trip or Transaction
   * collections. System-initiated (no PIN) since the passenger already
   * committed to the fare by requesting the trip.
   */
  async settleTrip(
    passengerId: string,
    driverId: string,
    amount: number,
    tripId: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const passengerWallet = await this.walletModel.findOne({
      userId: passengerId,
    });
    if (!passengerWallet)
      throw new NotFoundException('Passenger wallet not found');
    if (Number(passengerWallet.balance) < amount)
      throw new BadRequestException('Insufficient funds');

    const driverWallet = await this.ensureWallet(driverId);

    await this.walletModel.findByIdAndUpdate(passengerWallet._id, {
      $inc: { balance: -amount },
    });
    await this.walletModel.findByIdAndUpdate(driverWallet._id, {
      $inc: { balance: amount },
    });

    const debitTx = await this.transactionService.createTransaction({
      type: 'TRIP_PAYMENT',
      userId: passengerId,
      walletId: String(passengerWallet._id),
      amount,
      tripId,
      toUserId: driverId,
      toWalletId: String(driverWallet._id),
    } as any);

    await this.transactionService.createTransaction({
      type: 'TRIP_PAYMENT',
      userId: driverId,
      walletId: String(driverWallet._id),
      amount,
      tripId,
      toUserId: passengerId,
      toWalletId: String(passengerWallet._id),
    } as any);

    return { ok: true, transactionId: String(debitTx._id) };
  }

  private async notifyAndLog(
    userId: string,
    notificationType: Parameters<NotificationsService['create']>[1],
    action: Parameters<ActivityLogService['log']>[1],
    title: string,
    message: string,
    metadata?: any,
  ) {
    await this.notificationsService
      .create(userId, notificationType, title, message, metadata)
      .catch(() => undefined);
    await this.activityLogService
      .log(userId, action, message, metadata)
      .catch(() => undefined);
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.walletModel.findOne({ userId }).lean();
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.transactionService.findByWalletId(
      String(wallet._id),
      page,
      limit,
    );
  }

  async topUp(
    userId: string,
    amount: number,
    method: 'bank' | 'ussd' | 'card',
    opts: any = {},
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const customer = { name: userId, email: `${userId}@example.com` };

    const wallet = await this.walletModel.findOne({ userId }).lean();

    const init = await this.monnify.initializeTransaction(
      userId,
      amount,
      customer,
    );

    const transactionReference =
      init.providerResponse.responseBody.transactionReference;

    await this.paymentService.createPending({
      provider: 'MONNIFY',
      providerReference: transactionReference,
      userId,
      amount,
      metadata: { method },
    });

    switch (method) {
      case 'bank': {
        const bankCode = wallet?.bankCode;
        if (!bankCode)
          throw new BadRequestException(
            'bankCode is required for bank payments',
          );
        const resp = await this.monnify.initBankPayment(
          transactionReference,
          bankCode,
        );

        await this.paymentService.updateMetadata(transactionReference, {
          ...resp.raw,
          method,
        });
        return { transactionReference, ...resp };
      }
      case 'ussd': {
        const bankCode = opts.bankCode;
        if (!bankCode)
          throw new BadRequestException(
            'opts.bankCode (the customer\'s bank) is required for ussd payments',
          );
        const resp = await this.monnify.initUssdPayment(
          transactionReference,
          bankCode,
        );

        await this.paymentService.updateMetadata(transactionReference, {
          ...resp.raw,
          method,
        });
        return { transactionReference, ...resp };
      }
      case 'card': {
        const card = opts.card;
        if (!card)
          throw new BadRequestException(
            'card details required for card payments',
          );
        const resp = await this.monnify.chargeCard(transactionReference, card);
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
    userId: string,
    transactionReference: string | undefined,
    tokenId: string,
    token: string,
  ) {
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
      if (String(payment.userId) !== userId)
        throw new BadRequestException(
          'This payment does not belong to the authenticated user',
        );
    }

    const resp = await this.monnify.authorizeCardOtp(tokenId, token, txRef);
    if (txRef) {
      await this.paymentService.updateMetadata(txRef, {
        ...(payment?.metadata || {}),
        ...(resp.raw || {}),
      });
    }

    const providerRef = resp.providerReference || txRef;
    if (resp.status && String(resp.status).toUpperCase().includes('SUCCESS')) {
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

  async resolveAccountName(accountNumber: string, bankCode: string) {
    if (!accountNumber || !bankCode)
      throw new BadRequestException('accountNumber and bankCode are required');
    try {
      return await this.monnify.validateAccountNumber(accountNumber, bankCode);
    } catch (e: any) {
      const message =
        e?.response?.data?.responseMessage || 'Could not resolve account details';
      throw new BadRequestException(message);
    }
  }

  async createWalletForUser(userId: string, skipProvider = false) {
    const existing = await this.walletModel.findOne({ userId }).lean();
    if (existing) return existing;

    if (skipProvider) {
      const wallet = await this.walletModel.create({ userId });
      try {
        const ra = await this.monnify.createReservedAccount(userId);
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

    this.logger.debug(
      'Creating provider reserved account before local wallet for',
      userId,
    );

    const ra = await this.monnify.createReservedAccount(userId);
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

    const paymentsList = await this.paymentService.findByUserId(userId);
    const transactions = await this.transactionService.findByWalletId(
      String(wallet._id),
    );
    return { wallet, payments: paymentsList, transactions };
  }

  async credit(userId: string, amount: number, extra?: { paymentId?: string; providerReference?: string }) {
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

    await this.transactionService.createTransaction({
      type: 'TOPUP',
      userId,
      walletId: String(wallet._id),
      amount,
      ...extra,
    } as any);
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

    await this.transactionService.createTransaction({
      type: 'DEBIT',
      userId,
      walletId: String(wallet._id),
      amount,
    });

    await this.notifyAndLog(
      userId,
      'WALLET_DEBIT',
      'WALLET_DEBIT',
      'Wallet debited',
      `Your wallet was debited ${amount}`,
      { amount },
    );

    return updated;
  }

  async withdraw(userId: string, amount: number, pin: string) {
    if (amount < MIN_WITHDRAWAL_AMOUNT)
      throw new BadRequestException(
        `Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT}`,
      );

    const wallet = await this.walletModel.findOne({ userId });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!wallet.pinHash) throw new BadRequestException('Wallet PIN not set');
    const ok = await this.verifyPinHash(pin, wallet.pinHash);
    if (!ok) throw new BadRequestException('Invalid PIN');
    if (Number(wallet.balance) < amount)
      throw new BadRequestException('Insufficient funds');

    // Withdrawals always go to the account on file (set via /drivers/bank),
    // never to an account the caller supplies on the fly - a request body
    // destination would let a hijacked session redirect payouts elsewhere.
    const user = await this.usersService.findById(userId);
    if (!user?.accountNumber || !user?.bankCode) {
      throw new BadRequestException(
        'Add your bank account details before withdrawing',
      );
    }
    // Monnify's disbursement API requires the destination account name -
    // resolve it fresh rather than trusting anything stored, and do it
    // before debiting so a bad/changed account fails without needing a
    // rollback.
    const resolved = await this.resolveAccountName(
      user.accountNumber,
      user.bankCode,
    );
    const bank = {
      accountNumber: user.accountNumber,
      bankCode: user.bankCode,
      bankName: user.bankName,
      accountName: resolved.accountName,
    };

    await this.walletModel.findByIdAndUpdate(wallet._id, {
      $inc: { balance: -amount },
    });

    const transaction = await this.transactionService.createTransaction({
      type: 'WITHDRAWAL',
      status: 'PENDING',
      userId,
      walletId: String(wallet._id),
      amount,
      metadata: { bank },
    } as any);

    const reference = `withdrawal-${transaction._id}`;
    try {
      const result = await this.monnify.disburse(
        reference,
        amount,
        bank.bankCode,
        bank.accountNumber,
        `Wallet withdrawal for ${userId}`,
        bank.accountName,
      );

      await this.transactionService.updateStatus(
        String(transaction._id),
        'SUCCESS',
        { providerReference: result.providerReference } as any,
      );

      await this.notifyAndLog(
        userId,
        'WITHDRAWAL',
        'WALLET_WITHDRAWAL',
        'Withdrawal successful',
        `Your withdrawal of ${amount} was successful`,
        { amount, bank },
      );

      return { ok: true, transactionId: String(transaction._id), status: 'SUCCESS' };
    } catch (e) {
      this.logger.error('Withdrawal disbursement failed, rolling back', e);
      await this.walletModel.findByIdAndUpdate(wallet._id, {
        $inc: { balance: amount },
      });
      await this.transactionService.updateStatus(
        String(transaction._id),
        'FAILED',
      );

      await this.notifyAndLog(
        userId,
        'WITHDRAWAL',
        'WALLET_WITHDRAWAL',
        'Withdrawal failed',
        `Your withdrawal of ${amount} could not be completed and has been reversed`,
        { amount, bank },
      );

      throw new BadRequestException(
        'Withdrawal failed, please try again later',
      );
    }
  }

  async deposit(userId: string, amount: number) {
    const customer = { name: userId, email: `${userId}@example.com` };
    const init = await this.monnify.initializeTransaction(
      userId,
      amount,
      customer,
    );

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

    // Providers retry webhook/callback delivery, so guard against crediting
    // the wallet twice for the same providerReference.
    const existing =
      await this.paymentService.findByProviderReference(providerReference);
    if (existing && existing.status === 'SUCCESS') {
      return existing;
    }

    const payment = await this.paymentService.markSuccess(
      providerReference,
      amount,
      provider,
      userId,
    );

    await this.credit(userId, amount, {
      paymentId: String((payment as any)._id),
      providerReference,
    });

    await this.notifyAndLog(
      userId,
      'WALLET_CREDIT',
      'WALLET_TOPUP',
      'Wallet top-up successful',
      `Your wallet was credited ${amount}`,
      { amount, providerReference },
    );

    return payment;
  }

  /**
   * Handles a parsed Monnify webhook event (MonnifyService.parseWebhook output).
   * Two paths land here: a payment record already exists because the app
   * initiated it (card/ussd/bank-transfer via topUp()), or none exists because
   * the money was sent straight to a wallet's own reserved/virtual account -
   * in which case we resolve the wallet by the destination account number.
   */
  async handleMonnifyWebhookEvent(event: {
    providerReference?: string;
    amount?: number;
    status?: string;
    destinationAccountNumber?: string;
  }) {
    const { providerReference, amount, status, destinationAccountNumber } =
      event;

    const isSuccessful =
      status === 'PAID' || status === 'SUCCESS' || status === 'SUCCESSFUL';
    if (!isSuccessful || !providerReference || !amount) {
      return { handled: false };
    }

    const payment =
      await this.paymentService.findByProviderReference(providerReference);
    if (payment) {
      await this.processProviderPayment(
        providerReference,
        String(payment.userId),
        Number(amount),
      );
      return { handled: true, source: 'app-initiated' };
    }

    if (!destinationAccountNumber) {
      this.logger.warn(
        'Monnify webhook had no matching payment and no destination account',
        providerReference,
      );
      return { handled: false };
    }

    const wallet = await this.walletModel
      .findOne({
        $or: [
          { accountNumber: destinationAccountNumber },
          { providerAccountReference: destinationAccountNumber },
        ],
      })
      .lean();
    if (!wallet) {
      this.logger.warn(
        'Monnify webhook destination account matched no wallet',
        destinationAccountNumber,
      );
      return { handled: false };
    }

    await this.processProviderPayment(
      providerReference,
      String(wallet.userId),
      Number(amount),
    );
    return { handled: true, source: 'reserved-account' };
  }
}
