const fastify = require("fastify")({ logger: true });
const fs = require("fs").promises;
const solc = require("solc");
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, set, push } = require("firebase/database");
const { getAuth } = require("firebase/auth");
const { readFile, writeFile } = require("fs").promises;
require("dotenv").config();
// const Key = import.meta.env.VITE_FIREBASE_AUTH;
const firebaseConfig = {
  apiKey: process.env.APIKEY,
  authDomain: process.env.DOMAIN,
  projectId: process.env.ID,
  storageBucket: process.env.STORE,
  messagingSenderId: process.env.SENDID,
  appId: process.env.APPID,
  databaseURL: process.env.URL,
};
const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const database = getDatabase(app);

async function compileSolidity(sourceCode, contractName) {
  // Create the Solidity Compiler Standard Input and Output JSON
  const input = {
    language: "Solidity",
    sources: { main: { content: sourceCode } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
  };

  // Parse the compiler output to retrieve the ABI and Bytecode
  const output = solc.compile(JSON.stringify(input));
  const artifact = JSON.parse(output).contracts.main[contractName];

  return {
    abi: artifact.abi,
    bytecode: artifact.evm.bytecode.object,
  };
}


fastify.post("/compile", async (request, reply) => {
  try {
    // Load the contract source code
    const sourceCode = await fs.readFile("Demo.sol", "utf8");

    // Compile the source code and retrieve the ABI and Bytecode
    const { abi, bytecode } = await compileSolidity(sourceCode, "Demo");

    // Store the ABI and Bytecode into a JSON file
    const artifact = JSON.stringify({ abi, bytecode }, null, 2);

    await fs.writeFile("Demo.json", artifact);

    const db = getDatabase();
    const compilationRef = push(ref(db, "server"));
    try {

      await set(compilationRef, {
        timestamp: Date.now(),
        artifact: JSON.parse(await readFile("Demo.json", "utf8")),
      });
    } catch (error) {
      console.log(error);
    }

    reply.send({ message: "Compilation successful", abi, bytecode });
  } catch (error) {
    request.log.error("Error compiling Solidity:", error);
    reply.status(500).send({ error: "Internal Server Error" });
  }
});

// Start the server
const start = async () => {
  try {
    await fastify.listen(5252);
    console.log("Server listening ... ");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
