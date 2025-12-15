import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { v4 as uuid } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET;

export const resolvers = {
  Query: {
    async getUserDetails(parent, args, context) {
      console.log("✅ context in resolver:", context);

      if (!context.user) {
        throw new Error("Unauthorized");
      }

      const { rows } = await pool.query(
        "SELECT id, email, name FROM users WHERE id = $1",
        [context.user.id]
      );

      return rows[0];
    },
  },

  Mutation: {
    async signup(_, { email, password, name }) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const id = uuid();

      const { rows } = await pool.query(
        `INSERT INTO users (id, email, password, name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name`,
        [id, email, hashedPassword, name]
      );

      const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: "1d" });

      return {
        token,
        user: rows[0],
      };
    },

    async signin(_, { email, password }) {
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );

      const user = rows[0];
      if (!user) {
        throw new Error("Invalid credentials");
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new Error("Invalid credentials");
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: "1d",
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
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
