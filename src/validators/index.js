import { body, param } from "express-validator";

export const forgotPasswordValidator = () => [
    body("email")
        .isString().withMessage("Email must be a string")
        .trim()
        .notEmpty().withMessage("Email is required")
        .isEmail().withMessage("Email is invalid")
        .normalizeEmail(),
];

export const resetPasswordValidator = () => [
    param("token")
        .isString()
        .notEmpty().withMessage("Reset token is required"),

    body("password")
        .isString().withMessage("Password must be a string")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long"),
];


export const userRegisterValidator = () => [
  body("email")
    .isString().withMessage("Email must be a string")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Email is invalid")
    .normalizeEmail(),

  body("mobile")
    .isString().withMessage("Mobile must be a string")
    .trim()
    .notEmpty().withMessage("Mobile number is required")
    .matches(/^\+?[1-9]\d{7,14}$/)
    .withMessage("Mobile number must be valid"),

  body("password")
    .isString().withMessage("Password must be a string")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 8 }).withMessage(
      "Password must be at least 8 characters"
    ),

  body("fullName")
    .isString().withMessage("Full name must be a string")
    .trim()
    .notEmpty().withMessage("Full name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be between 2 and 100 characters"),
];

export const loginValidator = () => [
  body("email")
    .isString().withMessage("Email must be a string")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Email is invalid")
    .normalizeEmail(),

  body("password")
    .isString().withMessage("Password must be a string")
    .notEmpty().withMessage("Password is required"),
];

