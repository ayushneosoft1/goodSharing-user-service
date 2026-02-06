This is user service...

User Identity Authority: Serves as the central authority for user identity within a federated GraphQL system.Acts as the single source of truth for all user identity information.

User Management & Authentication Service

Owns and manages user entity data. Handles the full authentication lifecycle, including:

a. User signup – creating new accounts. b. User signin – verifying credentials and issuing tokens. c. Issues JWTs (JSON Web Tokens) to enable stateless authentication across microservices. d. Exposes user data to other services via Apollo Federation, allowing other subgraphs to reference users by ID.

This service does not perform following functions:
a. UI Server: It does not render pages or serve frontend content. b. API Gateway: It does not handle routing and request validation. c. Authorization Policy Engine : It does not enforce complex role-based or permission-based access control.(beyond verifying that a user exists in the context).

Key Architectural Implications:
a. Federation-first: The service is designed to integrate with Apollo Gateway, providing a centralized user service. b. Statelessness: Authentication is handled via JWTs, which means no session state is stored in memory. c. Data ownership: This service is the authoritative source for user data, ensuring consistency across the system.

Database Layer Behaviour
a. Using PostgresSql with connection pooling(pg library).SSL secured via a trusted CA certificate. Environment connection configured parameter.

Connection pool behaviour:

Efficiently reuses. Supports concurrent GraphQL resolver execution. Prevents connection exhaustion. Pool shared across all resolvers to avoid repeated connection overhead.

User Schema Evolution:
Original schema : single name column New Schema: first_name and last_name Migration Strategy: (a) Add new columns as nullable, (b) Backfill existing data, (c) Enforce not null constraints, (d) Drop legacy name column

GraphQL Server Role: Runs an ApolloServer as Federated Subgraph. Do not expose a standalone schema; composed by gateway with other services. Acts as authoritative source for user data.

Request LifeCycle:

(a) Incoming Request : Request goes through GraphQL GateWay. Gateway validates JWT, extracts user claims, and injects x-user header.

(b) Context Creation: Service reads x-user header. Parses its and attaches to context.user . context.user is the authentication boundary. Missing context.user => request treated as unauthenticated.

(c) Resolver execution: Resolvers check context.user Enforce authentication rules Query PostgresSql via connection pool. Return structured API responses.

Authentication Flows
(a) Signup: User provides email,password,firstname,lastname. Password is hashed with bcrypt. User record inserted into PostgreSQL. JWT is generated with : User ID, Email, Expiration Time. Token returned to client for future authentication.

(b) Signin : User submits email and password. Service fetches users record by email. Password is compared using bcrypt. On success New JWT issued. On failure: generic error returned to prevent user numeration attacks.

Federation Entity Resolution (a) Other services request a User by ID. (b) Apollo Gateway calls_resolveReference. (c) Service queries daatbase by ID and returns user data. (d) It ensures cebtralized data ownership. No direct db access by other services.

Error Handling Strategy (a) All errors are wrapped in structured API responses. (b) Raw DB or server errors are never exposed to clients. (c) Special handling for duplicate email registrations, unauthorized access, missing user records. Improves security, reliability, and client predictability.

Final Mental Model (a) Stateless identity microservice. (b) Owns all user data and authentication logic (c) Issues authentication tokens(JWTs) (d) Resolves User entities for the entire system (e) Scales independently and horizontally (f) Integrates seamelessly with Apollo Federation

Summary : The user Service is stateless, federated identity microservice that manages users,handles signup/signin securely, issues JWTs,and acts as the authoritative source for user data in a distributed GraphQL System.
