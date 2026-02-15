import 'dotenv/config';
import path from 'path';

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const CONFIG = {
  emailOrPhone: must('JIJI_EMAIL'),
  password: must('JIJI_PASSWORD'),
  homeUrl: process.env.JIJI_HOME_URL ?? 'https://jiji.co.ke/',
  checkUrl: process.env.JIJI_CHECK_URL ?? 'https://jiji.co.ke/profile',
  storageDir: path.resolve(process.cwd(), 'storage'),
  storageStatePath: path.resolve(process.cwd(), 'storage', 'storageState.json'),
};
