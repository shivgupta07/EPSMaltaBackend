import connection from "../index.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { sendMail } from "../Service/SendMail.js";

dotenv.config();
// admin Add POST API
export const userAdd = async (req, res) => {
  try {
    const { username, email, mobile, role } = req.body;

    // Check if the username already exists in the database
    const usernameCheckQuery = "SELECT * FROM users WHERE email = ?";
    const [existingUsers] = await connection.query(usernameCheckQuery, [email]);

    if (existingUsers.length > 0) {
      // email already exists, return an error
      return res.status(409).json({ error: "Email already exists" });
    }

    // Insert the new user into the database with the hashed password
    const insertQuery =
      "INSERT INTO users (username, email ,mobile, role) VALUES (?, ?, ? ,?)";
    await connection.query(insertQuery, [username, email, mobile, role]);

    const subject = "Action Required: Complete Your User Registration";
    const text = `To finalize your registration, please click on the link : 
    ${process.env.PASSWORD_URL}/generate-password`;

    // Send an email to the provided email address
    await sendMail(email, subject, text);
    res.status(200).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
};

// --------------------------------------------------------------------------------------------

// User View GET API
export const userView = async (req, res) => {
  try {
    // Perform the database query to fetch users and their client names
    const query = "SELECT * FROM users";
    const [rows] = await connection.query(query);

    // Return the user data with their client names
    res.status(200).json({ users: rows });
  } catch (error) {
    console.error("Error retrieving users:", error);
    res.status(500).json({ error: "Failed to retrieve users" });
  }
};

// User Edit PUT API
export const userEdit = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, mobile, role } = req.body;

    const emailCheckQuery = "SELECT * FROM users WHERE email = ? AND id != ?";
    const [existingUsers] = await connection.query(emailCheckQuery, [
      email,
      id,
    ]);

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: "Email already exists" });
    }
    
    const query =
      "UPDATE users SET username = ? ,email = ? , mobile = ? ,role = ? WHERE id = ?";
    await connection.query(query, [username, email, mobile, role, id]);

    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
};

// User Delete API
export const userDelete = async (req, res) => {
  try {
    const { id } = req.params; // Extract the user ID from the request parameters

    // Perform the database query to delete the user
    const query = "DELETE FROM users WHERE id = ?";
    await connection.query(query, [id]);

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};
