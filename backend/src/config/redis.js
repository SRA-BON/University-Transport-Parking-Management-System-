const redis = require('redis');
require('dotenv').config();

const clientConfig = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
      },
      password: process.env.REDIS_PASSWORD || undefined,
    };

const client = redis.createClient(clientConfig);

client.on('error', (err) => {
  console.error('[Redis] Client Error:', err.message);
});

client.on('connect', () => {
  console.log('[Redis] Client Connected');
  console.log('[Redis] If BullMQ warns about volatile-lru, set this Redis instance maxmemory-policy to noeviction in the Redis provider dashboard.');
});

const connectRedis = async () => {
  try {
    await client.connect();
  } catch (err) {
    console.error('[Redis] Failed to connect:', err.message);
  }
};

const disconnectRedis = async () => {
  try {
    if (client.isOpen || client.status === 'ready') {
      await client.quit();
    }
  } catch (err) {
    console.error('[Redis] Disconnect error:', err.message);
  }
};

module.exports = { client, connectRedis, disconnectRedis };
