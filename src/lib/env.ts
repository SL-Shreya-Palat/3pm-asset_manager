/**
 * Centralized environment configuration and validation.
 * Matches construction-portal pattern — import as `import { env } from "@/lib/env"`.
 */

type Auth3PMConfig = {
  idpUrl: string;
  clientId: string;
  clientSecret: string;
} | null;

type S3Config = {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
} | null;

type ResendConfig = {
  apiKey: string;
  fromEmail: string;
} | null;

type SendGridConfig = {
  apiKey: string;
  fromEmail: string;
} | null;

type GmailConfig = {
  user: string;
  appPassword: string;
} | null;

interface EnvConfig {
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  session: {
    maxAgeSeconds: number;
  };
  mongodb: {
    uri: string;
    dbName: string;
  };
  auth3pm: Auth3PMConfig;
  s3: S3Config;
  resend: ResendConfig;
  sendgrid: SendGridConfig;
  gmail: GmailConfig;
  google: {
    genAiApiKey: string;
  };
}

function optionalString(key: string): string | undefined {
  return process.env[key] || undefined;
}

function resolveAuth3PMConfig(): Auth3PMConfig {
  const idpUrl = optionalString('IDP_URL');
  const clientId = optionalString('AUTH_CLIENT_ID');
  const clientSecret = optionalString('AUTH_CLIENT_SECRET');

  if (idpUrl && clientId && clientSecret) {
    return { idpUrl: idpUrl.trim(), clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  }
  return null;
}

function buildEnv(): EnvConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
    session: {
      maxAgeSeconds: parseInt(process.env.SESSION_MAX_AGE || '86400', 10),
    },
    mongodb: {
      uri: process.env.MONGODB_URI || '',
      dbName: process.env.MONGODB_DB_NAME || 'asset-manager',
    },
    auth3pm: resolveAuth3PMConfig(),
    s3: resolveS3Config(),
    resend: resolveResendConfig(),
    sendgrid: resolveSendGridConfig(),
    gmail: resolveGmailConfig(),
    google: {
      genAiApiKey: process.env.GOOGLE_GENAI_API_KEY || '',
    },
  };
}

function resolveResendConfig(): ResendConfig {
  const apiKey = optionalString('RESEND_API_KEY');
  const fromEmail = optionalString('RESEND_FROM_EMAIL');

  if (apiKey && fromEmail) {
    return { apiKey, fromEmail };
  }
  return null;
}

function resolveSendGridConfig(): SendGridConfig {
  const apiKey = optionalString('SENDGRID_API_KEY');
  const fromEmail = optionalString('SENDGRID_FROM_EMAIL');

  if (apiKey && fromEmail) {
    return { apiKey, fromEmail };
  }
  return null;
}

function resolveGmailConfig(): GmailConfig {
  const user = optionalString('GMAIL_USER');
  const appPassword = optionalString('GMAIL_APP_PASSWORD');

  if (user && appPassword) {
    return { user, appPassword };
  }
  return null;
}

function resolveS3Config(): S3Config {
  const bucketName = optionalString('AWS_S3_BUCKET_NAME');
  const region = optionalString('AWS_S3_REGION');
  const accessKeyId = optionalString('AWS_ACCESS_KEY_ID');
  const secretAccessKey = optionalString('AWS_SECRET_ACCESS_KEY');

  if (bucketName && region && accessKeyId && secretAccessKey) {
    return { bucketName, region, accessKeyId, secretAccessKey };
  }
  return null;
}

export const env = buildEnv();
