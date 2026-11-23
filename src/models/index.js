const sequelize = require('../db');

const Customer = require('./customer.model');
const CustomerProfile = require('./customerProfile.model');
const Category = require('./category.model');
const Product = require('./product.model');
const Order = require('./order.model');
const OrderItem = require('./orderItem.model');
const ProductPriceHistory = require('./productPriceHistory.model');

// ---------------------------------------------------------------------------
// ASSOCIATIONS (relationships between tables)
//
// We always define BOTH sides. Each side gives us different helpers:
//   Customer.hasMany(Order)    -> customer.getOrders(), include: 'orders'
//   Order.belongsTo(Customer)  -> order.getCustomer(),  include: 'customer'
//
// Rule to remember:
//   the table that HAS the foreign key column  -> belongsTo
//   the other table                             -> hasOne / hasMany
// ---------------------------------------------------------------------------

// ONE-TO-ONE: a customer has one profile (customer_profiles.customer_id)
Customer.hasOne(CustomerProfile, { foreignKey: 'customerId', as: 'profile' });
CustomerProfile.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// ONE-TO-MANY: a customer places many orders (orders.customer_id)
Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Order.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

// ONE-TO-MANY: a category has many products (products.category_id)
Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

// ONE-TO-MANY: an order has many items, a product appears in many items
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItems' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// MANY-TO-MANY: orders <-> products, through the order_items table.
// This lets us write: Order.findAll({ include: 'products' })
Order.belongsToMany(Product, {
  through: OrderItem,
  foreignKey: 'orderId',
  otherKey: 'productId',
  as: 'products',
});
Product.belongsToMany(Order, {
  through: OrderItem,
  foreignKey: 'productId',
  otherKey: 'orderId',
  as: 'orders',
});

// ONE-TO-MANY: price history of a product (filled by a trigger)
Product.hasMany(ProductPriceHistory, { foreignKey: 'productId', as: 'priceHistory' });
ProductPriceHistory.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

module.exports = {
  sequelize,
  Customer,
  CustomerProfile,
  Category,
  Product,
  Order,
  OrderItem,
  ProductPriceHistory,
};
