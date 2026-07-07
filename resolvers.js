import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { pool } from "./db.js";
import { redis } from "./redis.js";

const JWT_SECRET = process.env.JWT_SECRET;
const CACHE_TTL = 604800; // 7 days

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET missing in .env");
}

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "1d" },
  );
};

export const resolvers = {
  Query: {
    async getUserDetails(_, __, context) {
      try {
        if (!context?.user) {
          return {
            status: "FAILED",
            statusMessage: "Unauthorized",
            data: null,
          };
        }

        const cacheKey = `user:${context.user.id}`;

        const cached = await redis.get(cacheKey);
        if (cached) {
          return {
            status: "SUCCESS",
            statusMessage: "Fetched successfully",
            data: JSON.parse(cached),
          };
        }

        const { rows } = await pool.query(
          `
          SELECT id, email, first_name, last_name
          FROM users
          WHERE id = $1
          `,
          [context.user.id],
        );

        if (!rows.length) {
          return {
            status: "FAILED",
            statusMessage: "User not found",
            data: null,
          };
        }

        await redis.set(cacheKey, JSON.stringify(rows[0]), "EX", CACHE_TTL);

        return {
          status: "SUCCESS",
          statusMessage: "Fetched successfully",
          data: rows[0],
        };
      } catch (err) {
        console.error("getUserDetails Error:", err);
        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    async getAllUserDetails() {
      try {
        const cacheKey = "users:all";

        const cached = await redis.get(cacheKey);
        if (cached) {
          return {
            status: "SUCCESS",
            statusMessage: "Fetched successfully",
            data: JSON.parse(cached),
          };
        }

        const { rows } = await pool.query(`
          SELECT id, email, first_name, last_name
          FROM users
          ORDER BY id DESC
        `);

        await redis.set(cacheKey, JSON.stringify(rows), "EX", CACHE_TTL);

        return {
          status: "SUCCESS",
          statusMessage: "Fetched successfully",
          data: rows,
        };
      } catch (err) {
        console.error("getAllUserDetails Error:", err);
        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    async getPushTokens(_, { userIds }, context) {
      try {
        const isInternalRequest =
          context?.serviceSecret &&
          context.serviceSecret === process.env.INTERNAL_SERVICE_SECRET;

        if (!isInternalRequest && !context?.user) {
          throw new Error("Unauthorized");
        }

        if (!Array.isArray(userIds) || userIds.length === 0) {
          return [];
        }

        const cleanUserIds = userIds
          .map((id) => Number(id))
          .filter((id) => !Number.isNaN(id));

        const { rows } = await pool.query(
          `
          SELECT user_id, push_token
          FROM user_push_tokens
          WHERE user_id = ANY($1::bigint[])
          `,
          [cleanUserIds],
        );

        return rows.map((row) => ({
          userId: row.user_id,
          pushToken: row.push_token,
        }));
      } catch (err) {
        console.error("getPushTokens Error:", err);
        return [];
      }
    },
  },

  Mutation: {
    async signup(_, { email, password, first_name, last_name }) {
      try {
        const normalizedEmail = email.trim().toLowerCase();

        const { rows: existing } = await pool.query(
          `
          SELECT id FROM users WHERE email = $1
          `,
          [normalizedEmail],
        );

        if (existing.length) {
          return {
            status: "FAILED",
            statusMessage: "Email already exists",
            data: null,
          };
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows } = await pool.query(
          `
          INSERT INTO users (email, password, first_name, last_name)
          VALUES ($1, $2, $3, $4)
          RETURNING id, email, first_name, last_name
          `,
          [
            normalizedEmail,
            hashedPassword,
            first_name.trim(),
            last_name.trim(),
          ],
        );

        await redis.del("users:all");

        return {
          status: "SUCCESS",
          statusMessage: "Signup successful",
          data: {
            token: generateToken(rows[0]),
            user: rows[0],
          },
        };
      } catch (err) {
        console.error("signup Error:", err);
        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    async signin(_, { email, password }) {
      try {
        const normalizedEmail = email.trim().toLowerCase();

        const { rows } = await pool.query(
          `
          SELECT id, email, password, first_name, last_name
          FROM users
          WHERE email = $1
          `,
          [normalizedEmail],
        );

        if (!rows.length) {
          return {
            status: "FAILED",
            statusMessage: "Invalid credentials",
            data: null,
          };
        }

        const user = rows[0];

        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
          return {
            status: "FAILED",
            statusMessage: "Invalid credentials",
            data: null,
          };
        }

        return {
          status: "SUCCESS",
          statusMessage: "Signin successful",
          data: {
            token: generateToken(user),
            user: {
              id: user.id,
              email: user.email,
              first_name: user.first_name,
              last_name: user.last_name,
            },
          },
        };
      } catch (err) {
        console.error("signin Error:", err);
        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    async savePushToken(_, { token }, context) {
      try {
        if (!context?.user) throw new Error("Unauthorized");

        if (!token || typeof token !== "string") return false;

        await pool.query(
          `
          INSERT INTO user_push_tokens (user_id, push_token)
          VALUES ($1, $2)
          ON CONFLICT (user_id, push_token) DO NOTHING
          `,
          [context.user.id, token],
        );

        return true;
      } catch (err) {
        console.error("savePushToken Error:", err);
        return false;
      }
    },

    async removePushToken(_, { token }, context) {
      try {
        if (!context?.user) throw new Error("Unauthorized");

        await pool.query(
          `
          DELETE FROM user_push_tokens
          WHERE user_id = $1 AND push_token = $2
          `,
          [context.user.id, token],
        );

        return true;
      } catch (err) {
        console.error("removePushToken Error:", err);
        return false;
      }
    },
  },

  User: {
    async __resolveReference(reference) {
      try {
        const cacheKey = `user:${reference.id}`;

        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const { rows } = await pool.query(
          `
          SELECT id, email, first_name, last_name
          FROM users
          WHERE id = $1
          `,
          [reference.id],
        );

        if (!rows.length) return null;

        await redis.set(cacheKey, JSON.stringify(rows[0]), "EX", CACHE_TTL);

        return rows[0];
      } catch (err) {
        console.error("User Reference Error:", err);
        return null;
      }
    },
  },
};
