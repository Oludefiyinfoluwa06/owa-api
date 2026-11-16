/**
 * Creates (or updates the password of) an admin account directly in the DB.
 * Admin accounts are intentionally not reachable through any public
 * registration endpoint - this script is the supported way to create one.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-admin.ts <phone> <email> <password> ["Full Name"]
 */
import 'dotenv/config';
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UserSchema } from '../src/modules/users/schemas/user.schema';

async function main() {
  const [phone, email, password, fullName] = process.argv.slice(2);
  if (!phone || !email || !password) {
    console.error(
      'Usage: seed-admin.ts <phone> <email> <password> ["Full Name"]',
    );
    process.exit(1);
  }

  const uri = process.env.DB_URI;
  if (!uri) {
    console.error('DB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const User = mongoose.model('User', UserSchema);

  const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));

  const admin = await User.findOneAndUpdate(
    { phone },
    {
      $set: {
        fullName: fullName || 'Admin',
        email,
        phone,
        passwordHash,
        role: 'admin',
        verified: true,
      },
    },
    { upsert: true, new: true },
  );

  console.log('Admin ready:', { id: admin._id, phone: admin.phone, email: admin.email });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
