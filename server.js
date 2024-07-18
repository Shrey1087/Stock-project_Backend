const cors = require("cors");
const express = require("express");
const axios = require("axios");
const app = express();
const { subMonths } = require("date-fns");
require("dotenv").config();

const moment = require("moment");
const PORT = process.env.PORT || 8000;
app.use(cors());
app.use(express.json());

// API key for Finnhub; replace 'YOUR_API_KEY' with your actual API key
const FINNHUB_API_KEY = "cmrg8v1r01qvmr5qjh70cmrg8v1r01qvmr5qjh7g";
const POLYGON_API_KEY = "mQaoGdDe3FTdURgB07Hk6eFtyTrixRsV";

const mongoose = require("mongoose");

const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds instead of the default 30
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
};

mongoose
  .connect(process.env.MONGO_URI, connectionOptions)
  .then(() => console.log("MongoDB connected..."))
  .catch((err) => {
    console.log("Failed to connect to MongoDB", err.message);
    console.log("Make sure your MONGO_URI is correct:", process.env.MONGO_URI);
    // Further error details can be logged here if necessary
  });

// It's also a good practice to listen to the connection error event after initial connection attempt
mongoose.connection.on("error", (err) => {
  console.error(`MongoDB connection error: ${err}`);
});

// const mongoose = require("mongoose");

// mongoose
//   .connect(process.env.MONGO_URI)
//   .then(() => console.log("MongoDB connected..."))
//   .catch((err) => console.log(err));

// Endpoint to determine if the market is open or closed
app.get("/api/market-status", async (req, res) => {
  try {
    // Fetch market status using Polygon API
    const response = await axios.get(
      `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`
    );

    // Check the market status
    const { market } = response.data;
    const isMarketOpen = market === "open";

    res.json({ isMarketOpen });
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({ error: "Failed to determine market status" });
  }
});

// Endpoint for Company’s Description
app.get("/api/summary/:ticker", async (req, res) => {
  const { ticker } = req.params;
  try {
    const profileResponse = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );
    res.json(profileResponse.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch summary data" });
  }
});

// Endpoint for Company's Quote
app.get("/api/quote/:ticker", async (req, res) => {
  const { ticker } = req.params;
  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );
    const quoteData = {
      currentPrice: response.data.c,
      high: response.data.h,
      low: response.data.l,
      open: response.data.o,
      previousClose: response.data.pc,
      change: response.data.d,
      percentChange: ((response.data.d / response.data.pc) * 100).toFixed(2),
      timestamp: response.data.t,
    };
    res.json(quoteData);
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({ error: "Failed to fetch stock quote" });
  }
});

// const { DateTime } = require("luxon");
// // Endpoint for Hourly Stock Price Variation Chart for the Last Working Day
// app.get("/api/hourlychart/:ticker", async (req, res) => {
//   let { ticker } = req.params;
//   // Convert ticker to uppercase
//   ticker = ticker.toUpperCase();

//   // Calculate the date of the last working day (assuming it's a weekday)
//   let lastWorkingDay = DateTime.local().minus({ days: 1 });
//   while (lastWorkingDay.weekday > 5) {
//     lastWorkingDay = lastWorkingDay.minus({ days: 1 });
//   }

//   // Convert the date to YYYY-MM-DD format
//   const lastWorkingDayFormatted = lastWorkingDay.toFormat("yyyy-MM-dd");

//   try {
//     // Fetch hourly data for the last working day using Polygon API
//     const response = await axios.get(
//       `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/hour/${lastWorkingDayFormatted}/${lastWorkingDayFormatted}?unadjusted=true&apiKey=${POLYGON_API_KEY}`
//     );

//     // Parse the JSON response and extract required fields
//     const hourlyData = response.data; // Assuming the response contains hourly data

//     res.json({ hourlyData });
//   } catch (error) {
//     console.error(error); // For debugging
//     res.status(500).json({
//       error: "Failed to fetch hourly stock prices for the last working day",
//     });
//   }
// });
const { DateTime } = require("luxon");

// Assuming 'app' is your Express app
app.get("/api/hourlychart/:ticker", async (req, res) => {
  let { ticker } = req.params;
  ticker = ticker.toUpperCase();

  try {
    // Fetch market status using Polygon API directly instead of the local endpoint
    const statusResponse = await axios.get(
      `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`
    );

    // Check the market status
    const isMarketOpen = statusResponse.data.market === "open";

    let fromDate, toDate;

    if (isMarketOpen) {
      // If the market is open, fetch data from yesterday to today
      fromDate = DateTime.now().minus({ days: 1 }).toFormat("yyyy-MM-dd");
      toDate = DateTime.now().toFormat("yyyy-MM-dd");
    } else {
      // If the market is closed, fetch data from the day before yesterday to yesterday
      fromDate = DateTime.now().minus({ days: 2 }).toFormat("yyyy-MM-dd");
      toDate = DateTime.now().minus({ days: 1 }).toFormat("yyyy-MM-dd");
    }

    // Fetch hourly stock price data using Polygon's API
    const stockResponse = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/hour/${fromDate}/${toDate}?unadjusted=true&apiKey=${POLYGON_API_KEY}`
    );

    const hourlyData = stockResponse.data; // Assuming this contains the needed data

    res.json({ hourlyData });
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({
      error: "Failed to fetch hourly stock prices or market status",
    });
  }
});

// Endpoint for Company’s Historical Chart Data using Polygon.io
app.get("/api/charts/:ticker", async (req, res) => {
  const { ticker } = req.params;
  try {
    const toDate = new Date();
    const fromDate = subMonths(toDate, 24); // Get date 6 months ago

    // Format dates to YYYY-MM-DD for the API call
    const formatToApiDate = (date) => date.toISOString().split("T")[0];

    const from = formatToApiDate(fromDate);
    const to = formatToApiDate(toDate);

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;

    const chartResponse = await axios.get(url);
    const responseData = chartResponse.data.results || [];

    // Transform data for HighCharts (if necessary, depending on your front-end implementation)
    const transformedData = responseData.map((data) => ({
      date: data.t,
      closePrice: data.c,
      volume: data.v,
    }));

    res.json(transformedData);
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// Endpoint for Autocomplete
app.get("/api/autocomplete/:query", async (req, res) => {
  const { query } = req.params;
  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/search?q=${query}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({ error: "Failed to fetch autocomplete suggestions" });
  }
});

// Endpoint for Company’s Recommendation Trends
app.get("/api/recommendations/:ticker", async (req, res) => {
  const { ticker } = req.params;
  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({ error: "Failed to fetch recommendation trends" });
  }
});

app.get("/api/news/:ticker", async (req, res) => {
  const { ticker } = req.params;
  const currentDate = new Date();
  const thirtyDaysAgo = new Date(
    currentDate.getTime() - 30 * 24 * 60 * 60 * 1000
  ); // 30 days in milliseconds

  // Convert dates to YYYY-MM-DD format
  const formatDate = (date) => date.toISOString().split("T")[0];

  const from = formatDate(thirtyDaysAgo);
  const to = formatDate(currentDate);

  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
    );
    // Assuming the response.data is an array of news items
    // First, filter out news items without images
    const newsWithImages = response.data.filter(
      (newsItem) => newsItem.image && newsItem.image.trim() !== ""
    );

    // Then sort by datetime in descending order and get the top 20
    const topTwentyNews = newsWithImages
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 20);

    res.json(topTwentyNews);
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Endpoint for Company’s Insider Sentiment
app.get("/api/insider-sentiment/:ticker", async (req, res) => {
  const { ticker } = req.params;
  const from = "2022-01-01"; // Use the default from date as per the PDF instruction
  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/insider-sentiment?symbol=${ticker}&from=${from}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error); // For debugging
    res.status(500).json({ error: "Failed to fetch insider sentiment" });
  }
});

// Endpoint for Company’s Peers
app.get("/api/peers/:ticker", async (req, res) => {
  const { ticker } = req.params;
  try {
    const peersResponse = await axios.get(
      `https://finnhub.io/api/v1/stock/peers?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );
    res.json(peersResponse.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch peers data" });
  }
});

// Endpoint for Company’s Earnings
app.get("/api/earnings/:ticker", async (req, res) => {
  const { ticker } = req.params;
  try {
    const earningsResponse = await axios.get(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );
    // Replace null values with 0 as per instruction
    const earningsData = earningsResponse.data.map((earning) => ({
      ...earning,
      Actual: earning.Actual !== null ? earning.Actual : 0,
      Estimate: earning.Estimate !== null ? earning.Estimate : 0,
    }));
    res.json(earningsData);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch earnings data" });
  }
});

const watchlistSchema = new mongoose.Schema({
  cname: {
    type: String,
    required: true,
    unique: true,
  },
  cticker: {
    type: String,
    required: true,
  },
  c: {
    type: String,
    required: true,
  },
  d: {
    type: String,
    required: true,
  },
  dp: {
    type: String,
    required: true,
  },
});

const Watchlist = mongoose.model("Watchlists", watchlistSchema);
app.post("/watchlist", async (req, res) => {
  try {
    const newWatchlistItem = new Watchlist({
      cname: req.body.cname,
      cticker: req.body.cticker,
      c: req.body.c,
      d: req.body.d,
      dp: req.body.dp,
    });

    const savedItem = await newWatchlistItem.save();

    res.status(201).json(savedItem);
  } catch (error) {
    console.error("Error saving to watchlist collection:", error);
    res.status(500).json({ error: "Failed to save document" });
  }
});

app.get("/watchlist", async (req, res) => {
  try {
    const watchlists = await Watchlist.find();
    res.json(watchlists);
  } catch (error) {
    console.error("Error fetching watchlists:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/watchlist/:cname", async (req, res) => {
  try {
    const watchlistItem = await Watchlist.findOne({ cname: req.params.cname });
    if (!watchlistItem) {
      return res.status(404).json({ error: "Watchlist item not found" });
    }
    res.json(watchlistItem);
  } catch (error) {
    console.error("Error fetching watchlist item:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.delete("/watchlist/:cname", async (req, res) => {
  try {
    const deletedWatchlistItem = await Watchlist.findOneAndDelete({
      cname: req.params.cname,
    });

    if (!deletedWatchlistItem) {
      return res.status(404).json({ error: "Watchlist item not found" });
    }

    res.json({ message: "Watchlist item deleted successfully" });
  } catch (error) {
    console.error("Error deleting watchlist item:", error);
    res.status(500).json({ error: "Failed to delete data" });
  }
});

const stockSchema = new mongoose.Schema({
  ticker: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [0, "Quantity must be at least 1"], // Ensure at least one share is held
    validate: {
      validator: Number.isInteger,
      message: "Quantity must be an integer",
    },
  },
  totalCost: {
    type: Number,
    required: true,
    min: [0, "Total cost cannot be negative"],
  },
});

const portfolioSchema = new mongoose.Schema({
  stocks: [stockSchema],
  wallet: {
    type: Number,
    required: true,
    default: 25000, // Default starting cash balance
    min: [0, "Wallet balance cannot be negative"],
  },
});

const Portfolio = mongoose.model("Portfolios", portfolioSchema);

module.exports = Portfolio;
// POST endpoint to buy stocks
app.post("/portfolio/buy", async (req, res) => {
  const { ticker } = req.body; // Assuming ticker is a string and doesn't need casting
  let { quantity } = req.body;
  quantity = Number(quantity);

  let portfolio = await Portfolio.findOne(); // Attempt to find the portfolio

  try {
    // Fetch current price from your /api/quote endpoint
    const quoteResponse = await axios.get(
      `http://localhost:${PORT}/api/quote/${ticker}`
    );
    const currentPrice = quoteResponse.data.currentPrice;
    if (quantity <= 0 || currentPrice < 0) {
      return res
        .status(400)
        .json({ error: "Invalid quantity or purchase price." });
    }
    if (isNaN(currentPrice) || isNaN(quantity)) {
      return res
        .status(400)
        .json({ error: "Invalid input for current price or quantity." });
    }

    let portfolio = await Portfolio.findOne(); // Get the single portfolio document

    if (!portfolio) {
      // Initialize the portfolio if it doesn't exist
      portfolio = new Portfolio();
      await portfolio.save();
    }

    if (portfolio.wallet < currentPrice * quantity) {
      return res.status(400).json({ error: "Insufficient funds in wallet." });
    }

    // Update or add the stock to the portfolio
    let stock = portfolio.stocks.find((s) => s.ticker === ticker);
    if (stock) {
      stock.quantity += quantity;
      stock.totalCost += currentPrice * quantity;
    } else {
      // Create a new stock object
      stock = {
        ticker: ticker,
        quantity: quantity,
        totalCost: currentPrice * quantity,
      };
      // Push the new stock object into the portfolio
      portfolio.stocks.push(stock);
    }

    // Deduct the purchase price from the wallet
    portfolio.wallet -= currentPrice * quantity;
    await portfolio.save();

    const averageCostPerShare = (stock.totalCost / stock.quantity).toFixed(2);
    const change = (currentPrice - averageCostPerShare).toFixed(2);
    const marketValue = (currentPrice * stock.quantity).toFixed(2);

    res.status(201).json({
      ticker,
      quantity: stock.quantity,
      totalCost: stock.totalCost,
      averageCostPerShare,
      currentPrice,
      change,
      marketValue,
      wallet: portfolio.wallet,
    });
  } catch (error) {
    console.error("Error in buying stock:", error);
    res.status(500).json({ error: "Failed to update portfolio on purchase" });
  }
});

// POST endpoint to sell stocks
app.post("/portfolio/sell", async (req, res) => {
  const { ticker } = req.body; // Assuming ticker is a string and doesn't need casting
  let { quantity } = req.body;
  quantity = Number(quantity);

  try {
    // Fetch current price from your /api/quote endpoint
    const quoteResponse = await axios.get(
      `http://localhost:${PORT}/api/quote/${ticker}`
    );
    const currentPrice = quoteResponse.data.currentPrice;

    if (quantity <= 0 || currentPrice < 0) {
      return res.status(400).json({ error: "Invalid quantity or sell price." });
    }
    const portfolio = await Portfolio.findOne(); // Get the single portfolio document
    let stock = portfolio.stocks.find((s) => s.ticker === ticker);

    if (!stock || stock.quantity < quantity) {
      return res
        .status(400)
        .json({ error: "Not enough stock to sell or stock not found." });
    }

    // Update the portfolio after selling
    stock.quantity -= quantity;
    // Inside the POST /portfolio/sell endpoint
    if (stock.quantity === 0) {
      portfolio.stocks = portfolio.stocks.filter((s) => s.ticker !== ticker);
    } else {
      stock.totalCost = (stock.totalCost - currentPrice * quantity).toFixed(2);
    }
    // Add the sale revenue to the wallet
    portfolio.wallet += currentPrice * quantity;
    await portfolio.save();

    // Calculate the change and market value after selling
    const averageCostPerShare =
      stock.quantity > 0 ? (stock.totalCost / stock.quantity).toFixed(2) : 0;
    const change =
      stock.quantity > 0 ? (currentPrice - averageCostPerShare).toFixed(2) : 0;
    const marketValue =
      stock.quantity > 0 ? (currentPrice * stock.quantity).toFixed(2) : 0;

    res.status(200).json({
      ticker,
      quantity: stock.quantity,
      totalCost: stock.totalCost,
      averageCostPerShare,
      currentPrice,
      change,
      marketValue,
      wallet: portfolio.wallet,
    });
  } catch (error) {
    console.error("Error in selling stock:", error);
    res.status(500).json({ error: "Failed to update portfolio on sale" });
  }
});

app.get("/portfolio/wallet", async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne(); // Assuming a single-user application
    if (!portfolio) {
      return res.status(404).json({ error: "Portfolio not found." });
    }
    res.json({ wallet: portfolio.wallet });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    res.status(500).json({ error: "Failed to fetch wallet balance." });
  }
});

// app.get("/portfolio/transactions", async (req, res) => {
//   try {
//     const portfolio = await Portfolio.findOne(); // Assuming a single-user application
//     if (!portfolio) {
//       return res.status(404).json({ error: "Portfolio not found." });
//     }
//     // Transform the stocks data to include buy/sell fields if necessary
//     // For this example, we're just sending back the stocks array
//     // You might need to adjust this based on your application's logic for tracking buys and sells
//     res.json({ transactions: portfolio.stocks });
//   } catch (error) {
//     console.error("Error fetching transactions:", error);
//     res.status(500).json({ error: "Failed to fetch transactions." });
//   }
// });

app.get("/portfolio/transactions", async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne(); // Assuming a single-user application
    if (!portfolio) {
      return res.status(404).json({ error: "Portfolio not found." });
    }

    const transactionsWithCalculatedFields = await Promise.all(
      portfolio.stocks.map(async (stock) => {
        // Fetch current price from the /api/quote endpoint
        const quoteResponse = await axios.get(
          `http://localhost:${PORT}/api/quote/${stock.ticker}`
        );
        const currentPrice = quoteResponse.data.currentPrice;

        // Fetch stock name from the /api/summary endpoint
        const summaryResponse = await axios.get(
          `http://localhost:${PORT}/api/summary/${stock.ticker}`
        );
        const stockName = summaryResponse.data.name; // Adjust based on actual response structure

        const averageCostPerShare = stock.totalCost / stock.quantity;
        const change = currentPrice - averageCostPerShare;
        const marketValue = currentPrice * stock.quantity;

        return {
          ticker: stock.ticker,
          name: stockName, // Include the fetched stock name
          quantity: stock.quantity,
          totalCost: stock.totalCost,
          averageCostPerShare,
          currentPrice,
          change,
          marketValue,
        };
      })
    );

    res.json({ transactions: transactionsWithCalculatedFields });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions." });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
