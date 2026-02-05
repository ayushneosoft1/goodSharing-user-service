import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

export const resolvers = {
  Query: {
    async getUserDetails(parent, args, context) {
      console.log(" Context object:", context);
      console.log(" Context user:", context.user);

      if (!context.user) {
        console.log(" Unauthorized: No user in context");
        return {
          status: 401,
          statusMessage: "Unauthorized",
          data: null,
        };
      }

      const userId = Number(context.user.id);

      const { rows } = await pool.query(
        "SELECT id, email, first_name,last_name FROM users WHERE id = $1",
        [userId],
      );

      if (!rows.length) {
        return {
          status: 404,
          statusMessage: "User not found",
          data: null,
        };
      }

      return {
        status: 200,
        statusMessage: "User details fetched successfully",
        data: rows[0] || null,
      };
    },

    async getAllUserDetails(parent, args, context) {
      console.log("context.user", context.user);
      if (!context.user) {
        return {
          status: 401,
          statusMessage: "Unauthorized",
          data: null,
        };
      }
      try {
        const { rows } = await pool.query(
          "SELECT id,email,first_name,last_name FROM users",
        );
        return {
          status: 200,
          statusMessage: "All users detailed fetched successfully",
          data: rows,
        };
      } catch (error) {
        console.error(error);
        return {
          status: 500,
          statusMessage: "Internal server error",
          data: null,
        };
      }
    },
  },

  Mutation: {
    async signup(_, { email, password, first_name, last_name }) {
      const hashedPassword = await bcrypt.hash(password, 10);

      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password, first_name,last_name)
         VALUES ($1, $2, $3,$4)
         RETURNING id, email, first_name,last_name`,
          [email, hashedPassword, first_name, last_name],
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
        [email],
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
      const { rows } = await pool.query(
        "SELECT id, email, first_name,last_name FROM users WHERE id = $1",
        [ref.id],
      );
      return rows[0];
    },
  },
};
