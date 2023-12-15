// Import dependencies
import express from "express";
import {
  userAdd,
  userDelete,
  userEdit,
  userView,
} from "../Controller/userController.js";

// Create an Express router
const router = express.Router();

// User Register Route
router.post("/register", userAdd);

// User All view Route
router.get("/view", userView);

// User Edit Route
router.put("/edit/:id", userEdit);

// User Delete Route
router.delete("/delete/:id", userDelete);

// Export the router
export default router;
