import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * Payload for POST /auth/register.
 * No token required — creates a MERCHANT_ADMIN for the given merchant.
 */
export class RegisterDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsUUID()
  merchantId: string;
}
