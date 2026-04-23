require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { FAIRHAVEN_PRODUCTS } = require('./products');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'fairhaven' });
    console.log('Connected to MongoDB');

    await Product.deleteMany({});
    console.log('Cleared existing products');

    const created = await Product.insertMany(FAIRHAVEN_PRODUCTS);
    console.log(`Seeded ${created.length} FairHaven products`);

    await mongoose.connection.close();
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
