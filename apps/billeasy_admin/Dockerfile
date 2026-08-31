# Build stage for admin frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/admin/frontend
COPY frontend/package*.json ./
RUN npm install --force --legacy-peer-deps
COPY frontend/ ./
# We pass build args for Vercel/Railway links if needed during build
ARG VITE_ADMIN_BACKEND_URL
ARG VITE_ADMIN_SECRET
ARG VITE_SAAS_URL
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app/admin

# Copy admin backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --force --legacy-peer-deps
COPY backend/ ./backend/

# Copy built frontend from build stage
COPY --from=frontend-build /app/admin/frontend/dist ./frontend/dist

# Copy root server (gateway)
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
