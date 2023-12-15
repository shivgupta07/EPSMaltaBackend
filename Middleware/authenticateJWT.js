import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const authenticateJWT = (req, res, next) => {
  // Get the JWT token from the request headers
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    // Token not provided, return an error
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Verify the JWT token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    // Token is valid, attach the user object to the request for future use
    req.user = decoded;
    next();
  } catch (err) {
    // Token is invalid or secret key is incorrect
    return res.status(403).json({ error: "Forbidden" });
  }
};
