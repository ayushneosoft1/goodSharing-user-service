import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { redis } from "./redis.js";

const JWT_SECRET = process.env.JWT_SECRET;
const CACHE_TTL = 604800;

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
    {
      expiresIn: "1d",
    },
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

        if (cached !== null) {
          console.log("User Cache HIT");

          return {
            status: "SUCCESS",
            statusMessage: "Fetched successfully",
            data: JSON.parse(cached),
          };
        }

        console.log("User Cache MISS");

        const { rows } = await pool.query(
          `
          SELECT
            id,
            email,
            first_name,
            last_name
          FROM users
          WHERE id=$1
          `,
          [context.user.id],
        );

        if (!rows[0]) {
          return {
            status: "FAILED",
            statusMessage: "User not found",
            data: null,
          };
        }

        const user = rows[0];

        await redis.set(cacheKey, JSON.stringify(user), "EX", CACHE_TTL);

        return {
          status: "SUCCESS",
          statusMessage: "Fetched successfully",
          data: user,
        };
      } catch (err) {
        console.error("Get User Error:", err);

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

        if (cached !== null) {
          console.log("Users Cache HIT");

          return {
            status: "SUCCESS",
            statusMessage: "Fetched successfully",
            data: JSON.parse(cached),
          };
        }

        console.log("Users Cache MISS");

        const { rows } = await pool.query(
          `
            SELECT
              id,
              email,
              first_name,
              last_name
            FROM users
            ORDER BY id DESC
            `,
        );

        await redis.set(cacheKey, JSON.stringify(rows), "EX", CACHE_TTL);

        return {
          status: "SUCCESS",
          statusMessage: "Fetched successfully",
          data: rows,
        };
      } catch (err) {
        console.error("Get Users Error:", err);

        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },
  },

  Mutation: {
    async signup(_, { email, password, first_name, last_name }) {
      try {
        const normalizedEmail = email.trim().toLowerCase();

        const firstName = first_name.trim();

        const lastName = last_name.trim();

        const { rows: existing } = await pool.query(
          `
            SELECT id
            FROM users
            WHERE email=$1
            `,
          [normalizedEmail],
        );

        if (existing.length > 0) {
          return {
            status: "FAILED",
            statusMessage: "Email already exists",
            data: null,
          };
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows } = await pool.query(
          `
            INSERT INTO users
            (
              email,
              password,
              first_name,
              last_name
            )
            VALUES($1,$2,$3,$4)

            RETURNING
              id,
              email,
              first_name,
              last_name
            `,
          [normalizedEmail, hashedPassword, firstName, lastName],
        );

        const user = rows[0];

        await redis.del("users:all");

        return {
          status: "SUCCESS",
          statusMessage: "Signup successful",
          data: {
            token: generateToken(user),
            user,
          },
        };
      } catch (err) {
        console.error("Signup Error:", err);

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
            SELECT
              id,
              email,
              password,
              first_name,
              last_name
            FROM users
            WHERE email=$1
            `,
          [normalizedEmail],
        );

        if (!rows[0]) {
          return {
            status: "FAILED",
            statusMessage: "Invalid credentials",
            data: null,
          };
        }

        const user = rows[0];

        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
          return {
            status: "FAILED",
            statusMessage: "Invalid credentials",
            data: null,
          };
        }

        const safeUser = {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        };

        return {
          status: "SUCCESS",
          statusMessage: "Signin successful",
          data: {
            token: generateToken(user),
            user: safeUser,
          },
        };
      } catch (err) {
        console.error("Signin Error:", err);

        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },
  },

  User: {
    async __resolveReference(reference) {
      try {
        const cacheKey = `user:${reference.id}`;

        const cached = await redis.get(cacheKey);

        if (cached !== null) {
          return JSON.parse(cached);
        }

        const { rows } = await pool.query(
          `
            SELECT
              id,
              email,
              first_name,
              last_name
            FROM users
            WHERE id=$1
            `,
          [reference.id],
        );

        if (!rows[0]) {
          return null;
        }

        await redis.set(cacheKey, JSON.stringify(rows[0]), "EX", CACHE_TTL);

        return rows[0];
      } catch (err) {
        console.error("Reference Error:", err);

        return null;
      }
    },
  },
};
