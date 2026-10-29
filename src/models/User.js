import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    mobile: {
      type: String,
      unique:true,
      required: [true, "Mobile number is required"],
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
    },

    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer",
    },

    // JWT Tokens
    refreshToken: {
      type: String
    },

    isActive: {
      type: Boolean,
      default: true,
    },

  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  
  emailVerificationToken: {
    type: String,
    default: null,
  },
  
  emailVerificationExpiry: {
    type: Date,
    default: null,
  },

  
  isEmailVerified: {
    type: Boolean,
    default: false,
  },

  resetPasswordToken: {
    type: String,
    default: null,
  },

  resetPasswordExpiry: {
    type: Date,
    default: null,
  },

  },
  {
    timestamps: true,
  }
);

// Hash password before saving a new password
userSchema.pre("save", async function(){
    if(!this.isModified("password")) return ; // means do nothing
    this.password = await bcrypt.hash(this.password, 10);
})

// Compare a login password with the stored hash
userSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function(){
    const secret = process.env.ACCESS_TOKEN_SECRET;
    const expiry = process.env.ACCESS_TOKEN_EXPIRY;
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            fullName: this.fullName
        },
        secret,
        { expiresIn: expiry }
    )
}

userSchema.methods.generateRefreshToken = function(){
    const secret =
        process.env.REFRESH_TOKEN_SECRET;
    const expiry =
        process.env.REFRESH_TOKEN_EXPIRY;
    return jwt.sign(
        {
            _id: this._id,
        },
        secret,
        { expiresIn: expiry }
    )
}

const User = mongoose.model("User", userSchema);

export default User;