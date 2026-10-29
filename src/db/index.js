import mongoose from "mongoose";
import dns from "dns";

// Ensure reliable DNS resolution for mongodb+srv URLs across all ISPs
try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (err) {
    // Ignore in environments where setting DNS servers is restricted
}

const connectDB = async () => {
    try{
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected");
    }
    catch(error){
        console.error("❌ MonogDB connection error", error);
        process.exit(1);
    }
}

export default connectDB;