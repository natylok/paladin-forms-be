-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('FREEMIUM', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "userType" "UserType" NOT NULL DEFAULT E'FREEMIUM';
