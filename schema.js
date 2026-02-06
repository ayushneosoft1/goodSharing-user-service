import gql from "graphql-tag";

export const typeDefs = gql`
  type Query {
    getUserDetails: UserResponse
    getAllUserDetails: UsersResponse
  }

  type Mutation {
    # Mutation API 1
    signup(
      email: String!
      password: String!
      first_name: String!
      last_name: String!
    ): ApiResponse

    # Mutation API 2
    signin(email: String!, password: String!): ApiResponse
  }

  type UserResponse {
    status: Int!
    statusMessage: String!
    data: User
  }

  type UsersResponse {
    status: Int!
    statusMessage: String!
    data: [User!]
  }

  type User @key(fields: "id") {
    id: ID!
    email: String!
    first_name: String!
    last_name: String!
  }

  type ApiResponse {
    status: Int!
    statusMessage: String!
    data: AuthData
  }

  type AuthData {
    token: String!
    user: User!
  }
`;
