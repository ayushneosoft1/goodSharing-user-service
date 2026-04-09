import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { redis } from "./redis.js";

const JWT_SECRET = process.env.JWT_SECRET;
const CACHE_TTL = 7 * 24 * 60 * 60; // 604800 seconds (7 days)

console.log("JWT_SECRET:", JWT_SECRET);

export const resolvers = {
  Query: {
    async getUserDetails(parent, args, context) {
      try {
        if (!context.user) {
          return {
            status: "FAILED",
            statusMessage: "Unauthorized",
            data: null,
          };
        }

        const userId = context.user.id;
        const cacheKey = `user:id:${userId}`;

        const cachedUser = await redis.get(cacheKey);
        if (cachedUser) {
          return {
            status: "SUCCESS",
            statusMessage: "User fetched from cache",
            data: JSON.parse(cachedUser),
          };
        }

        const { rows } = await pool.query(
          "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
          [userId],
        );

        const user = rows[0];

        if (!user) {
          return {
            status: "FAILED",
            statusMessage: "User not found",
            data: null,
          };
        }

        await redis.set(cacheKey, JSON.stringify(user), "EX", CACHE_TTL);

        return {
          status: "SUCCESS",
          statusMessage: "User fetched successfully",
          data: user,
        };
      } catch (err) {
        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    async getAllUserDetails() {
      try {
        const { rows } = await pool.query(
          "SELECT id, email, first_name, last_name FROM users",
        );

        return {
          status: "SUCCESS",
          statusMessage: "Users fetched successfully",
          data: rows,
        };
      } catch (err) {
        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },
  },

  // ✅ FIXED: Mutation OUTSIDE Query
  Mutation: {
    async signup(_, { email, password, first_name, last_name }) {
      console.log(" SIGNUP RESOLVER CALLED");

      try {
        const normalizedEmail = email.trim().toLowerCase();
        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows } = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, first_name, last_name`,
          [normalizedEmail, hashedPassword, first_name, last_name],
        );

        const user = rows[0];

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
          expiresIn: "1d",
        });

        return {
          status: "SUCCESS", // ✅ FIXED
          statusMessage: "Signup successful",
          data: { token, user },
        };
      } catch (err) {
        if (err.code === "23505") {
          return {
            status: "FAILED",
            statusMessage: "Email already registered",
            data: null,
          };
        }

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
          "SELECT * FROM users WHERE email = $1",
          [normalizedEmail],
        );

        const user = rows[0];

        if (!user) {
          return {
            status: "FAILED",
            statusMessage: "Invalid credentials",
            data: null,
          };
        }

        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
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

        const token = jwt.sign(
          { id: safeUser.id, email: safeUser.email },
          JWT_SECRET,
          { expiresIn: "1d" },
        );

        return {
          status: "SUCCESS", // ✅ FIXED
          statusMessage: "Signin successful",
          data: { token, user: safeUser },
        };
      } catch (err) {
        return {
          status: "FAILED",
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },
  },

  User: {
    async __resolveReference(ref) {
      const { rows } = await pool.query(
        "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
        [ref.id],
      );
      return rows[0] || null;
    },
  },
};
