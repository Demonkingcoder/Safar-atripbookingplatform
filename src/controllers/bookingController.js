
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Trip from "../models/Trip.js";
import Departure from "../models/Departure.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import razorpay from "../utils/razorpay.js";
import crypto from "node:crypto";

// POST /api/v1/bookings
const createBooking = asyncHandler(async (req, res) => {
  const { departureId, numberOfSeats } = req.body;

  if (!mongoose.isValidObjectId(departureId)) {
    throw new ApiError(400, "Invalid departure ID");
  }

  if (
    !Number.isInteger(numberOfSeats) ||
    numberOfSeats < 1 ||
    numberOfSeats > 10
  ) {
    throw new ApiError(
      400,
      "Number of seats must be an integer between 1 and 10"
    );
  }

  const departure = await Departure.findOne({
    _id: departureId,
    status: "scheduled",
    startDate: { $gt: new Date() },
  });

  if (!departure) {
    throw new ApiError(404, "Departure not found or unavailable");
  }

  const trip = await Trip.findOne({
    _id: departure.trip,
    status: "published",
  });

  if (!trip) {
    throw new ApiError(404, "Trip not found or unavailable");
  }

  // Atomically reserve seats to prevent overbooking.
  const reservedDeparture = await Departure.findOneAndUpdate(
    {
      _id: departure._id,
      status: "scheduled",
      startDate: { $gt: new Date() },
      availableSeats: { $gte: numberOfSeats },
    },
    {
      $inc: { availableSeats: -numberOfSeats },
    },
    { new: true }
  );

  if (!reservedDeparture) {
    throw new ApiError(409, "Not enough seats available");
  }

  const totalAmount = reservedDeparture.price * numberOfSeats;

  try {
    const booking = await Booking.create({
      user: req.user._id,
      trip: trip._id,
      departure: reservedDeparture._id,
      numberOfSeats,
      pricePerSeat: reservedDeparture.price,
      totalAmount,
      status: "pending",
      paymentStatus: "pending",
    });

    return res.status(201).json(
      new ApiResponse(
        201,
        { booking },
        "Booking created successfully. Payment is pending."
      )
    );
  } catch (error) {
    // Release the seats if creating the booking fails.
    await Departure.updateOne(
      { _id: reservedDeparture._id },
      { $inc: { availableSeats: numberOfSeats } }
    );

    throw error;
  }
});

// GET /api/v1/bookings/my-bookings
const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .populate("trip", "title slug destination images")
    .populate(
      "departure",
      "startDate endDate price status"
    )
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      { bookings },
      "Bookings fetched successfully"
    )
  );
});


const cancelBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, "Invalid booking ID");
  }

  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      user: req.user._id,
      status: "pending",
      paymentStatus: "pending",
    },
    {
      $set: { status: "cancelled" },
    },
    { new: true }
  );

  if (!booking) {
    throw new ApiError(
      404,
      "Booking not found, already cancelled, or cannot be cancelled"
    );
  }

  const departure = await Departure.updateOne(
    { _id: booking.departure },
    { $inc: { availableSeats: booking.numberOfSeats } }
  );

  if (departure.matchedCount !== 1) {
    throw new ApiError(500, "Could not release reserved seats");
  }

  return res.status(200).json(
    new ApiResponse(200, { booking }, "Booking cancelled successfully")
  );
});


const createPaymentOrder = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const booking = await Booking.findOne({
    _id: bookingId,
    user: req.user._id,
  });

  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  if (
    booking.status !== "pending" ||
    booking.paymentStatus !== "pending"
  ) {
    throw new ApiError(400, "Booking is not payable");
  }

  const amount = Math.round(booking.totalAmount * 100);

  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw new ApiError(400, "Invalid payment amount");
  }

  const order = await razorpay.orders.create({
    amount,
    currency: "INR",
    receipt: `booking_${booking._id}`,
  });

  booking.razorpayOrderId = order.id;
  await booking.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
      },
      "Payment order created successfully"
    )
  );
});


const verifyPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  // 1. Validate required fields
  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature
  ) {
    throw new ApiError(400, "Missing payment verification fields");
  }

  // 2. Find the booking owned by the logged-in user
  const booking = await Booking.findOne({
    _id: bookingId,
    user: req.user._id,
  });

  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  // 3. Ensure the order belongs to this booking
  if (booking.razorpayOrderId !== razorpay_order_id) {
    throw new ApiError(400, "Order does not match this booking");
  }

  // 4. Generate the expected signature
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  // 5. Compare signatures safely
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(razorpay_signature, "hex");

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    throw new ApiError(400, "Invalid payment signature");
  }

  // 6. Prevent re-verifying an already completed payment
  if (booking.paymentStatus === "paid") {
    return res.status(200).json(
      new ApiResponse(200, { booking }, "Payment already verified")
    );
  }

  // 7. Mark the booking as paid
  booking.razorpayPaymentId = razorpay_payment_id;
  booking.paymentStatus = "paid";
  booking.status = "confirmed";

  await booking.save();

  return res.status(200).json(
    new ApiResponse(200, { booking }, "Payment verified successfully")
  );
});

export { createBooking, getMyBookings, cancelBooking, createPaymentOrder, verifyPayment };