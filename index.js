// import { get } from "http";

const fastify = require("fastify")({ logger: true });
const fs = require("fs").promises;
const solc = require("solc");
require("dotenv").config();
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, set, get, push } = require("firebase/database");
const { getAuth } = require("firebase/auth");
const { readFile, writeFile } = require("fs").promises;

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
  try {
    // Create the Solidity Compiler Standard Input and Output JSON
    const input = {
      language: "Solidity",
      sources: { main: { content: sourceCode } },
      settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
    };

    // Parse the compiler output to retrieve the ABI and Bytecode
    const output = solc.compile(JSON.stringify(input));
    const compiledData = JSON.parse(output);

    if (compiledData.errors) {
      // Log compilation errors
      console.error("Compilation Errors:", compiledData.errors);
      throw new Error("Compilation failed with errors.");
    }

    const artifact = compiledData.contracts.main[contractName];

    if (!artifact) {
      // Log a warning if the artifact is undefined
      console.warn("Artifact is undefined for contract:", contractName);
    }

    return {
      abi: artifact ? artifact.abi : [],
      bytecode: artifact ? artifact.evm.bytecode.object : "",
    };
  } catch (error) {
    console.error("Error compiling Solidity:", error);
    throw error; // Re-throw the error to be caught in the calling function
  }
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
    const compilationRef = push(ref(db, "vite/firstcompile"));
    try {
      await set(compilationRef, {
        timestamp: Date.now(),
        artifact: JSON.parse(await readFile("Demo.json", "utf8")),
        // artifact: JSON.parse(await readFile("Demo.json", "utf8")),
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


fastify.post('/secondcompile', async (request, reply) => {
  try {
    // Extract the solidityCode from the request payload
    const { solidityCode } = request.body;

    // Compile the source code and retrieve the ABI and Bytecode
    const { abi, bytecode } = await compileSolidity(solidityCode, "TokenContract");

    // Store the ABI and Bytecode into a JSON file
    const artifact = JSON.stringify({ abi, bytecode }, null, 2);
    await fs.writeFile('Demo.json', artifact);

    // Save the compilation data to Firebase
    const db = getDatabase();
    const compilationRef = push(ref(db, "vite/secondcompile"));
    try {
      await set(compilationRef, {
        timestamp: Date.now(),
        artifact: JSON.parse(await readFile("Demo.json", "utf8")),
        // artifact: JSON.parse(await readFile("Demo.json", "utf8")),
      });
    } catch (error) {
      console.log(error);
    }

    reply.send({ message: 'Compilation successful', abi, bytecode });
  } catch (error) {
    console.log(error)
    request.log.error('Error compiling Solidity:', error);
    reply.status(500).send({ error: 'Internal Server Error' });
  }
});


fastify.get("/readCompilationsFromFirebase", async (request, reply) => {
  try {
    // Get a reference to the "compilations" path in Firebase
    const db = database;
    const compilationsRef = ref(db, "vite/secondcompile");

    // Retrieve the data from Firebase
    const snapshot = await get(compilationsRef);
    const compilationsData = snapshot.val();
    const result = [];
    if (compilationsData) {
      // Iterate through the children of the "compilations" folder
      Object.keys(compilationsData).forEach(async (compilationKey) => {
        const compilation = compilationsData[compilationKey];
        const { timestamp, artifact } = compilation;

        console.log("Compilation Key:", compilationKey);
        console.log("Timestamp:", timestamp);
        console.log("ABI:", artifact.abi);
        console.log("Bytecode:", artifact.bytecode);

        try {
          const parsedData = { abi: artifact.abi, bytecode: artifact.bytecode };
          const returneddata = { abi: artifact.abi, bytecode: artifact.bytecode, compilationKey:compilationKey, timestamp:timestamp };
          result.push(returneddata);

          // Write the parsed data to ParsedData.json
          await fs.writeFile(
            `./src/ParsedJSONData/${compilationKey}.json`,
            JSON.stringify(parsedData, null, 2)
          );

          console.log(
            `Data parsed and written to ParsedJSONData${compilationKey}.json`
          );
        } catch (error) {
          console.error(
            `Error writing parsed data to file for ${compilationKey}:`,
            error.message
          );
        }
      });
    } else {
      console.log('No compilations found in the "compilations" path.');
    }
    reply.send({ message: "Read successful", compilations: result });
  } catch (error) {
    console.log(error);
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
