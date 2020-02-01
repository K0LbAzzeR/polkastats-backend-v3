// @ts-check
// Required imports
const { ApiPromise, WsProvider } = require('@polkadot/api');

// Postgres lib
const { Pool } = require('pg');

// Import config params
const {
  wsProviderUrl,
  postgresConnParams
} = require('../backend.config');

async function main () {
  
  // Initialise the provider to connect to the local polkadot node
  const provider = new WsProvider(wsProviderUrl);

  // Create the API and wait until ready
  const api = await ApiPromise.create({ provider });
  
  // Subscribe to new blocks
  const unsubscribe = await api.rpc.chain.subscribeNewHeads( async (header) => {

    // Get block number
    const blockNumber = header.number.toNumber();

    // Get block hash
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);

    // Get extended block header
    const extendedHeader = await api.derive.chain.getHeader(blockHash);

    // Get block parent hash
    const parentHash = header.parentHash;
    
    // Get block extrinsics root
    const extrinsicsRoot = header.extrinsicsRoot;

    // Get block state root
    const stateRoot = header.stateRoot;

    // Get block author
    const blockAuthor = extendedHeader.author;

    // Get block author identity display name
    const blockAuthorIdentity = await api.derive.accounts.info(`GTzRQPzkcuynHgkEHhsPBFpKdh4sAacVRsnd8vYfPpTMeEY`);
    const blockAuthorName = blockAuthorIdentity.identity.display;

    // Get session info
    const session = await api.derive.session.info();

    // Database connection
    const pool = new Pool(postgresConnParams);

    // Handle chain reorganizations
    const sqlSelect = `SELECT block_number FROM block WHERE block_number = '${blockNumber}'`;
    const res = await pool.query(sqlSelect);
    if (res.rows.length > 0) {
      // Chain reorganization detected! We need to update block_author, block_hash and state_root
      console.log(`PolkaStats - Block listener - Detected chain reorganization at block #${blockNumber}, updating author, author name, hash and state root`);
      const timestamp = new Date().getTime();

      // Get block author
      const blockAuthor = extendedHeader.author;

      // Get block author identity display name
      const blockAuthorIdentity = await api.derive.accounts.info(`GTzRQPzkcuynHgkEHhsPBFpKdh4sAacVRsnd8vYfPpTMeEY`);
      const blockAuthorName = blockAuthorIdentity.identity.display;

      const sqlUpdate =
        `UPDATE block SET block_author = '${blockAuthor}', block_author_name = '${blockAuthorName}', block_hash = '${blockHash}', state_root = '${stateRoot}' WHERE block_number = '${blockNumber}'`;
      const res = await pool.query(sqlUpdate);

    } else {
      console.log(`PolkaStats - Block listener - Adding block: #${blockNumber}`);
      const timestamp = new Date().getTime();
      const sqlInsert =
        `INSERT INTO block (
          block_number,
          block_author,
          block_author_name,
          block_hash,
          parent_hash,
          extrinsics_root,
          state_root,
          current_era,
          current_index,
          era_length,
          era_progress,
          is_epoch,
          session_length,
          session_per_era,
          session_progress,
          validator_count,
          timestamp
        ) VALUES (
          '${blockNumber}',
          '${blockAuthor}',
          '${blockAuthorName}',
          '${blockHash}',
          '${parentHash}',
          '${extrinsicsRoot}',
          '${stateRoot}',
          '${session.currentEra}',
          '${session.currentIndex}',
          '${session.eraLength}',
          '${session.eraProgress}',
          '${session.isEpoch}',
          '${session.sessionLength}',
          '${session.sessionsPerEra}',
          '${session.sessionProgress}',
          '${session.validatorCount}',
          '${timestamp}'
        )`;
      const res = await pool.query(sqlInsert);
    }
    // We connect/disconnect in each loop to avoid problems if database server is restarted while crawler is running
    await pool.end();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(-1);
});

