import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { redis } from "./redis.js";

const JWT_SECRET = process.env.JWT_SECRET;
const CACHE_TTL = 7 * 24 * 60 * 60; // 604800 seconds (7 days)

export const resolvers = {
  Query: {
    async getUserDetails(parent, args, context) {
      if (!context.user) {
        return { status: 401, statusMessage: "Unauthorized", data: null };
      }

      const userId = context.user.id;
      const cacheKeyById = `user:id:${userId}`;

      // Check Redis first
      const cachedUser = await redis.get(cacheKeyById);
      if (cachedUser) {
        console.log("⚡ Cache HIT:", cacheKeyById);
        return {
          status: 200,
          statusMessage: "User details fetched successfully",
          data: JSON.parse(cachedUser),
        };
      }

      console.log("Cache MISS:", cacheKeyById);

      // Fetch from DB
      const { rows } = await pool.query(
        "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
        [userId],
      );

      const user = rows[0];
      if (!user)
        return { status: 404, statusMessage: "User not found", data: null };

      // Restore cache
      try {
        await redis.set(cacheKeyById, JSON.stringify(user), "EX", CACHE_TTL);
        await redis.set(
          `user:email:${user.email}`,
          JSON.stringify(user),
          "EX",
          CACHE_TTL,
        );
        console.log("Cache restored with 7 days TTL");
      } catch (err) {
        console.error(" Redis set error:", err);
      }

      return {
        status: 200,
        statusMessage: "User details fetched successfully",
        data: user,
      };
    },
  },

  Mutation: {
    // SIGNUP
    async signup(_, { email, password, first_name, last_name }) {
      console.log(" SIGNUP RESOLVER CALLED");

      const normalizedEmail = email.trim().toLowerCase();
      const hashedPassword = await bcrypt.hash(password, 10);

      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, first_name, last_name`,
          [normalizedEmail, hashedPassword, first_name, last_name],
        );

        const user = rows[0];

        // Before redis

        console.log(" About to write to Redis");

        // Store in Redis
        try {
          await redis.set(
            `user:id:${user.id}`,
            JSON.stringify(user),
            "EX",
            CACHE_TTL,
          );
          await redis.set(
            `user:email:${normalizedEmail}`,
            JSON.stringify(user),
            "EX",
            CACHE_TTL,
          );
          console.log(
            " User cached in Redis:",
            `user:id:${user.id}`,
            `user:email:${normalizedEmail}`,
          );
        } catch (err) {
          console.error(" Redis set error (signup):", err);
        }

        // Generate JWT
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
          expiresIn: "1d",
        });

        return {
          status: 201,
          statusMessage: "Signup successful",
          data: { token, user },
        };
      } catch (err) {
        if (err.code === "23505") {
          return {
            status: 400,
            statusMessage: "Email already registered",
            data: null,
          };
        }
        console.error(" Signup DB error:", err);
        return {
          status: 500,
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    // SIGNIN
    async signin(_, { email, password }) {
      const normalizedEmail = email.trim().toLowerCase();
      const cacheKeyByEmail = `user:email:${normalizedEmail}`;

      try {
        // Check cache first
        const cached = await redis.get(cacheKeyByEmail);
        if (cached) {
          console.log(" Cache HIT:", cacheKeyByEmail);
          const user = JSON.parse(cached);
          const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: "1d" },
          );
          return {
            status: 200,
            statusMessage: "Signin successful",
            data: { token, user },
          };
        }

        console.log("Cache MISS:", cacheKeyByEmail);

        // Fetch from DB
        const { rows } = await pool.query(
          "SELECT * FROM users WHERE email = $1",
          [normalizedEmail],
        );
        const user = rows[0];
        if (!user)
          return {
            status: 400,
            statusMessage: "Invalid credentials",
            data: null,
          };

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid)
          return {
            status: 400,
            statusMessage: "Invalid credentials",
            data: null,
          };

        const safeUser = {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        };

        // Restore cache
        try {
          await redis.set(
            `user:id:${user.id}`,
            JSON.stringify(safeUser),
            "EX",
            CACHE_TTL,
          );
          await redis.set(
            cacheKeyByEmail,
            JSON.stringify(safeUser),
            "EX",
            CACHE_TTL,
          );
          console.log(
            " User cached in Redis after signin:",
            `user:id:${user.id}`,
            cacheKeyByEmail,
          );
        } catch (err) {
          console.error(" Redis set error (signin):", err);
        }

        const token = jwt.sign(
          { id: safeUser.id, email: safeUser.email },
          JWT_SECRET,
          { expiresIn: "1d" },
        );
        return {
          status: 200,
          statusMessage: "Signin successful",
          data: { token, user: safeUser },
        };
      } catch (err) {
        console.error(" Signin error:", err);
        return {
          status: 500,
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },
  },

  User: {
    async __resolveReference(ref) {
      const cacheKey = `user:id:${ref.id}`;
      const cachedUser = await redis.get(cacheKey);
      if (cachedUser) return JSON.parse(cachedUser);

      const { rows } = await pool.query(
        "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
        [ref.id],
      );
      const user = rows[0];

      if (user) {
        await redis.set(cacheKey, JSON.stringify(user), "EX", CACHE_TTL);
        await redis.set(
          `user:email:${user.email}`,
          JSON.stringify(user),
          "EX",
          CACHE_TTL,
        );
      }

      return user || null;
    },
  },
};
