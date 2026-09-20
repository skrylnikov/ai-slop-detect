import "dotenv/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

const config = {
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    db: { connection: process.env.DATABASE_URL ?? "" },
  }),
};

Object.assign(config, { $prismaConfig: 1 });
export default config;
