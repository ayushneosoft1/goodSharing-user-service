import gql from "graphql-tag";

export const typeDefs = gql`
  type User @key(fields: "id") {
    id: ID!
    email: String!
    name: String!
  }

  type AuthData {
    token: String!
    user: User!
  }

  type ApiResponse {
    status: Int!
    statusMessage: String!
    data: AuthData
  }

  type UserResponse {
    status: Int!
    statusMessage: String!
    data: User
  }

  type Query {
    getUserDetails: UserResponse
  }

  type Mutation {
    signup(email: String!, password: String!, name: String!): ApiResponse
    signin(email: String!, password: String!): ApiResponse
  }
`;
