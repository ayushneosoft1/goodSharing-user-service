import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { redis } from "./redis.js";

const JWT_SECRET = process.env.JWT_SECRET;
const CACHE_TTL = 600;

export const resolvers = {
  Query: {
    async getUserDetails(parent, args, context) {
      if (!context.user) {
        return { status: 401, statusMessage: "Unauthorized", data: null };
      }

      const userId = context.user.id;
      const cacheKey = `user:${userId}`;

      // 1. Check Redis first
      const cachedUser = await redis.get(cacheKey);
      if (cachedUser) {
        console.log("⚡ Cache HIT:", cacheKey);
        return {
          status: 200,
          statusMessage: "User details fetched successfully",
          data: JSON.parse(cachedUser),
        };
      }

      console.log("Cache MISS:", cacheKey);

      // 2. Fetch from DB
      const { rows } = await pool.query(
        "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
        [userId],
      );

      const user = rows[0];

      if (!user) {
        return { status: 404, statusMessage: "User not found", data: null };
      }

      // 3. Store in Redis
      try {
        await redis.set(cacheKey, JSON.stringify(user), "EX", CACHE_TTL);
        console.log(" Stored user in Redis:", cacheKey);
      } catch (err) {
        console.error("Redis set error:", err);
      }

      // 4. Return response
      return {
        status: 200,
        statusMessage: "User details fetched successfully",
        data: user,
      };
    },

    async testUserCache(_, args, context) {
      if (!context.user) {
        return { status: 401, statusMessage: "Unauthorized", data: null };
      }

      const cacheKey = `user:${context.user.id}`;
      const ttl = await redis.ttl(cacheKey);
      const data = await redis.get(cacheKey);

      console.log("TestUserCache:", { cacheKey, ttl, data });

      return {
        status: 200,
        statusMessage: "User cache info fetched",
        data: {
          cacheKey,
          ttl,
          cachedData: data ? JSON.parse(data) : null,
        },
      };
    },
  },

  Mutation: {
    async signup(_, { email, password, first_name, last_name }) {
      const hashedPassword = await bcrypt.hash(password, 10);

      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password, first_name, last_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, first_name, last_name`,
          [email, hashedPassword, first_name, last_name],
        );

        const user = rows[0];

        // Store in Redis
        try {
          await redis.set(
            `user_${user.email}`,
            JSON.stringify(user),
            "EX",
            CACHE_TTL,
          );
        } catch (err) {
          console.error("Redis set error:", err);
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
          expiresIn: "1d",
        });

        return {
          status: 201,
          statusMessage: "Signup successful",
          data: { token, user },
        };
      } catch (err) {
        console.error("SIGNUP ERROR:", err);

        if (err.code === "23505") {
          return {
            status: 400,
            statusMessage: "This Email Id is already registered",
            data: null,
          };
        }

        return {
          status: 500,
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    async signin(_, { email, password }) {
      const cacheKey = `user_${email}`;

      try {
        let data = await redis.get(cacheKey);
        console.log(" User cached:", data);

        return {
          status: 200,
          statusMessage: "Signin successful",
          data: {
            token,
            user: {
              id: data.id,
              email: data.email,
              first_name: data.first_name,
              last_name: data.last_name,
            },
          },
        };
      } catch (redisError) {
        console.error("Redis error", redisError);
      }

      const { rows } = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email],
      );

      const user = rows[0];

      if (!user) {
        return {
          status: 400,
          statusMessage: "Invalid credentials",
          data: null,
        };
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return {
          status: 400,
          statusMessage: "Invalid credentials",
          data: null,
        };
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: "1d",
      });

      return {
        status: 200,
        statusMessage: "Signin successful",
        data: {
          token,
          user: {
            id: rows[0].id,
            email: rows[0].email,
            first_name: rows[0].first_name,
            last_name: rows[0].last_name,
          },
        },
      };
    },
  },

  User: {
    async __resolveReference(ref) {
      const cacheKey = `user:${ref.id}`;

      // 1. Check Redis
      const cachedUser = await redis.get(cacheKey);
      if (cachedUser) return JSON.parse(cachedUser);

      // 2. Fetch from DB
      const { rows } = await pool.query(
        "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
        [ref.id],
      );

      const user = rows[0];

      // 3. Store in Redis
      if (user) {
        try {
          await redis.set(cacheKey, JSON.stringify(user), "EX", CACHE_TTL);
        } catch (err) {
          console.error("Redis set error:", err);
        }
      }

      return user || null;
    },
  },
};
