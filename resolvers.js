import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET;

export const resolvers = {
  Query: {
    async getUserDetails(parent, args, context) {
      if (!context.user) {
        return {
          status: 401,
          statusMessage: "Unauthorized",
          data: null,
        };
      }

      const { rows } = await pool.query(
        "SELECT id, email, name FROM users WHERE id = $1",
        [context.user.id]
      );

      return {
        status: 200,
        statusMessage: "User details fetched successfully",
        data: rows[0],
      };
    },
  },

  Mutation: {
    async signup(_, { email, password, name }) {
      const hashedPassword = await bcrypt.hash(password, 10);

      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name`,
          [email, hashedPassword, name]
        );

        const user = rows[0];

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
          expiresIn: "1d",
        });

        return {
          status: 201,
          statusMessage: "Signup successful",
          data: {
            token,
            user,
          },
        };
      } catch (err) {
        // Unique email violation
        if (err.code === "23505") {
          return {
            status: 400,
            statusMessage: "This Email Id is already registered",
            data: null,
          };
        }

        // Unknown error
        return {
          status: 500,
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },

    async signin(_, { email, password }) {
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );

      const user = rows[0];
      console.log("🚀 ~ user: ====>", user);
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
            id: user.id,
            email: user.email,
            name: user.name,
          },
        },
      };
    },
  },

  User: {
    async __resolveReference(ref) {
      const { rows } = await pool.query(
        "SELECT id, email, name FROM users WHERE id = $1",
        [ref.id]
      );
      return rows[0];
    },
  },
};
