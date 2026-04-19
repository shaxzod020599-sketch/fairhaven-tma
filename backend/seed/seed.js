require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');

const products = [
  // Vitamins
  { name: 'Vitamin D3 2000 IU', price: 89000, category: 'vitamins', description: 'Витамин D3 для поддержки иммунитета и костей. 60 капсул.', brand: 'Solgar', isAvailable: true, imageUrl: '' },
  { name: 'Vitamin C 1000mg', price: 65000, category: 'vitamins', description: 'Витамин С с шиповником. Антиоксидантная защита. 100 таблеток.', brand: 'Now Foods', isAvailable: true, imageUrl: '' },
  { name: 'B-Complex 50', price: 120000, category: 'vitamins', description: 'Полный комплекс витаминов группы B. 100 капсул.', brand: 'Nature\'s Way', isAvailable: true, imageUrl: '' },
  { name: 'Vitamin E 400 IU', price: 95000, category: 'vitamins', description: 'Натуральный витамин Е. Антиоксидант. 100 капсул.', brand: 'Solgar', isAvailable: true, imageUrl: '' },
  { name: 'Мультивитамины для женщин', price: 185000, category: 'vitamins', description: 'Комплекс витаминов и минералов для женщин. 90 таблеток.', brand: 'Garden of Life', isAvailable: true, imageUrl: '' },
  // Supplements
  { name: 'Omega-3 Fish Oil', price: 145000, category: 'supplements', description: 'Рыбий жир Омега-3. EPA/DHA. 120 капсул.', brand: 'Nordic Naturals', isAvailable: true, imageUrl: '' },
  { name: 'Magnesium Glycinate 400mg', price: 110000, category: 'supplements', description: 'Магний глицинат для нервной системы и сна. 120 капсул.', brand: 'Doctor\'s Best', isAvailable: true, imageUrl: '' },
  { name: 'Zinc 50mg', price: 45000, category: 'supplements', description: 'Цинк для иммунитета. 100 таблеток.', brand: 'Now Foods', isAvailable: true, imageUrl: '' },
  { name: 'Коллаген Type I & III', price: 195000, category: 'supplements', description: 'Гидролизованный коллаген для кожи и суставов. 300г порошок.', brand: 'Sports Research', isAvailable: true, imageUrl: '' },
  { name: 'Пробиотик 50 млрд', price: 165000, category: 'supplements', description: '14 штаммов пробиотиков. 30 капсул.', brand: 'Garden of Life', isAvailable: false, imageUrl: '' },
  // Cosmetics
  { name: 'Гиалуроновая сыворотка', price: 230000, category: 'cosmetics', description: 'Увлажняющая сыворотка с гиалуроновой кислотой. 30мл.', brand: 'The Ordinary', isAvailable: true, imageUrl: '' },
  { name: 'Крем SPF 50+', price: 175000, category: 'cosmetics', description: 'Солнцезащитный крем широкого спектра. 50мл.', brand: 'La Roche-Posay', isAvailable: true, imageUrl: '' },
  { name: 'Ретинол 0.5%', price: 280000, category: 'cosmetics', description: 'Сыворотка с ретинолом для обновления кожи. 30мл.', brand: 'SkinCeuticals', isAvailable: true, imageUrl: '' },
  // Parapharmaceuticals
  { name: 'Термометр цифровой', price: 55000, category: 'parapharmaceuticals', description: 'Электронный термометр с памятью. Точность ±0.1°C.', brand: 'Omron', isAvailable: true, imageUrl: '' },
  { name: 'Тонометр автоматический', price: 450000, category: 'parapharmaceuticals', description: 'Автоматический тонометр на плечо. Память на 60 измерений.', brand: 'Omron', isAvailable: true, imageUrl: '' },
  { name: 'Ингалятор компрессорный', price: 380000, category: 'parapharmaceuticals', description: 'Компрессорный небулайзер для ингаляций.', brand: 'B.Well', isAvailable: false, imageUrl: '' },
  // Hygiene
  { name: 'Зубная паста отбеливающая', price: 42000, category: 'hygiene', description: 'Отбеливающая паста без фтора. 100мл.', brand: 'Sensodyne', isAvailable: true, imageUrl: '' },
  { name: 'Антисептик для рук', price: 25000, category: 'hygiene', description: 'Антисептический гель 70% спирта. 250мл.', brand: 'Sanitelle', isAvailable: true, imageUrl: '' },
  { name: 'Мицеллярная вода', price: 135000, category: 'hygiene', description: 'Очищающая мицеллярная вода для чувствительной кожи. 400мл.', brand: 'Bioderma', isAvailable: true, imageUrl: '' },
  // Drinks
  { name: 'Протеиновый коктейль Шоколад', price: 295000, category: 'drinks', description: 'Протеиновый порошок со вкусом шоколада. 900г.', brand: 'Optimum Nutrition', isAvailable: true, imageUrl: '' },
  { name: 'Коллагеновый напиток', price: 155000, category: 'drinks', description: 'Жидкий коллаген с витаминами. 500мл.', brand: 'Applied Nutrition', isAvailable: true, imageUrl: '' },
  { name: 'Электролиты без сахара', price: 75000, category: 'drinks', description: 'Порошок электролитов. 30 порций.', brand: 'LMNT', isAvailable: true, imageUrl: '' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'fairhaven' });
    console.log('Connected to MongoDB');

    await Product.deleteMany({});
    console.log('Cleared existing products');

    const created = await Product.insertMany(products);
    console.log(`Seeded ${created.length} products`);

    await mongoose.connection.close();
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
