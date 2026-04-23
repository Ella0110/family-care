const path = require("path");
require("dotenv").config();

const tencentcloud = require("tencentcloud-sdk-nodejs");

const TcbClient = tencentcloud.tcb.v20180608.Client;
const DEFAULT_TCB_API_REGION = "ap-shanghai";
const DEFAULT_TCB_API_ENDPOINT = "tcb.tencentcloudapi.com";

const COLLECTIONS = [
    "users",
    "profiles",
    "relationships",
    "records",
    "medications",
    "invitations",
];
const INDEX_OPERATIONS = [
    {
        tableName: "records",
        indexName: "idx_records_profile_type_measuredAt",
        keys: [
            { Name: "profileId", Direction: "1" },
            { Name: "type", Direction: "1" },
            { Name: "measuredAt", Direction: "-1" },
        ],
    },
    {
        tableName: "records",
        indexName: "idx_records_profile_measuredAt",
        keys: [
            { Name: "profileId", Direction: "1" },
            { Name: "measuredAt", Direction: "-1" },
        ],
    },
    {
        tableName: "relationships",
        indexName: "idx_relationships_user_profile_unique",
        keys: [
            { Name: "userId", Direction: "1" },
            { Name: "profileId", Direction: "1" },
        ],
        unique: true,
    },
    {
        tableName: "relationships",
        indexName: "idx_relationships_profileId",
        keys: [{ Name: "profileId", Direction: "1" }],
    },
    {
        tableName: "relationships",
        indexName: "idx_relationships_userId",
        keys: [{ Name: "userId", Direction: "1" }],
    },
    {
        tableName: "profiles",
        indexName: "idx_profiles_createdBy",
        keys: [{ Name: "createdBy", Direction: "1" }],
    },
    {
        tableName: "invitations",
        indexName: "idx_invitations_token_unique",
        keys: [{ Name: "token", Direction: "1" }],
        unique: true,
    },
    {
        tableName: "medications",
        indexName: "idx_medications_profile_deletedAt",
        keys: [
            { Name: "profileId", Direction: "1" },
            { Name: "deletedAt", Direction: "1" },
        ],
    },
];

const TTL_INDEX_OPERATION = {
    tableName: "invitations",
    indexName: "idx_invitations_expiresAt_ttl",
    command: {
        createIndexes: "invitations",
        indexes: [
            {
                key: { expiresAt: 1 },
                name: "idx_invitations_expiresAt_ttl",
                expireAfterSeconds: 0,
            },
        ],
    },
};

function loadLocalConfig() {
    const localConfigPath = path.resolve(process.cwd(), "local.config.js");
    try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require(localConfigPath);
    } catch (error) {
        return {};
    }
}

function parseArgs(argv) {
    return {
        execute: argv.includes("--execute"),
    };
}

function printPlan(plan) {
    console.log("[init-db] mode: dry-run");
    console.log(JSON.stringify(plan, null, 2));
}

function isAlreadyExistsError(error) {
    return Boolean(
        error &&
        error.code &&
        /exist|duplicate|already/i.test(String(error.code)),
    );
}

function isIdempotentIndexError(error) {
    return Boolean(
        error &&
        `${error.code} ${error.message}`.match(/exist|duplicate|already/i),
    );
}

function createTcbClient(credentials) {
    return new TcbClient({
        credential: {
            secretId: credentials.secretId,
            secretKey: credentials.secretKey,
        },
        // Use the official SDK control-plane configuration that is already
        // verified locally with DescribeEnvs.
        region: process.env.TENCENTCLOUD_REGION || DEFAULT_TCB_API_REGION,
        profile: {
            httpProfile: {
                endpoint:
                    process.env.TENCENTCLOUD_ENDPOINT ||
                    DEFAULT_TCB_API_ENDPOINT,
            },
        },
    });
}

async function resolveEnvironmentMeta(client, envId) {
    const response = await client.DescribeEnvs({ EnvId: envId });
    const envInfo = Array.isArray(response.EnvList)
        ? response.EnvList[0]
        : null;
    const databaseInfo =
        envInfo && Array.isArray(envInfo.Databases)
            ? envInfo.Databases[0]
            : null;

    if (
        !envInfo ||
        !databaseInfo ||
        !databaseInfo.InstanceId ||
        !databaseInfo.Region
    ) {
        throw new Error(
            "Unable to resolve database InstanceId/Region from DescribeEnvs",
        );
    }

    return {
        instanceId: databaseInfo.InstanceId,
        region: databaseInfo.Region,
    };
}

async function createCollection(client, tableName, envId, meta) {
    try {
        await client.CreateTable({
            TableName: tableName,
            EnvId: envId,
            Tag: meta.instanceId,
        });
        console.log(`[init-db] created collection: ${tableName}`);
    } catch (error) {
        if (isAlreadyExistsError(error)) {
            console.log(`[init-db] collection exists, skip: ${tableName}`);
            return;
        }
        throw error;
    }
}

async function createIndex(client, operation, envId, meta) {
    try {
        await client.UpdateTable({
            TableName: operation.tableName,
            EnvId: envId,
            Tag: meta.instanceId,
            CreateIndexes: [
                {
                    IndexName: operation.indexName,
                    MgoKeySchema: {
                        MgoIndexKeys: operation.keys,
                        MgoIsUnique: Boolean(operation.unique),
                        MgoIsSparse: false,
                    },
                },
            ],
        });
        console.log(
            `[init-db] created index: ${operation.tableName}.${operation.indexName}`,
        );
    } catch (error) {
        if (isIdempotentIndexError(error)) {
            console.log(
                `[init-db] index exists, skip: ${operation.tableName}.${operation.indexName}`,
            );
            return;
        }
        throw error;
    }
}

async function createTtlIndex(client, envId, meta) {
    try {
        await client.RunCommands({
            EnvId: envId,
            Tag: meta.instanceId,
            MgoCommands: [
                {
                    TableName: TTL_INDEX_OPERATION.tableName,
                    CommandType: "COMMAND",
                    Command: JSON.stringify(TTL_INDEX_OPERATION.command),
                },
            ],
        });
        console.log(
            `[init-db] created ttl index: ${TTL_INDEX_OPERATION.tableName}.${TTL_INDEX_OPERATION.indexName}`,
        );
    } catch (error) {
        if (isIdempotentIndexError(error)) {
            console.log(
                `[init-db] ttl index exists, skip: ${TTL_INDEX_OPERATION.tableName}.${TTL_INDEX_OPERATION.indexName}`,
            );
            return;
        }
        throw error;
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const localConfig = loadLocalConfig();
    const envId = process.env.TCB_ENV_ID || localConfig.envId;
    const secretId = process.env.TENCENTCLOUD_SECRET_ID;
    const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
    const apiRegion =
        process.env.TENCENTCLOUD_REGION || DEFAULT_TCB_API_REGION;
    const apiEndpoint =
        process.env.TENCENTCLOUD_ENDPOINT || DEFAULT_TCB_API_ENDPOINT;
    const plan = {
        envId: envId || "YOUR_ENV_ID",
        mode: args.execute ? "execute" : "dry-run",
        sdk: {
            region: apiRegion,
            endpoint: apiEndpoint,
        },
        collections: COLLECTIONS,
        indexes: INDEX_OPERATIONS,
        ttlIndex: TTL_INDEX_OPERATION,
    };

    if (!args.execute) {
        printPlan(plan);
        return;
    }

    if (!envId) {
        throw new Error(
            "TCB_ENV_ID or local.config.js envId is required for --execute",
        );
    }

    if (!secretId || !secretKey) {
        throw new Error(
            "TENCENTCLOUD_SECRET_ID and TENCENTCLOUD_SECRET_KEY are required for --execute",
        );
    }

    const client = createTcbClient({ secretId, secretKey });
    const meta = await resolveEnvironmentMeta(client, envId);

    console.log(
        `[init-db] execute mode, envId=${envId}, apiRegion=${apiRegion}, dbRegion=${meta.region}, instanceId=${meta.instanceId}`,
    );

    for (const collection of COLLECTIONS) {
        await createCollection(client, collection, envId, meta);
    }

    for (const indexOperation of INDEX_OPERATIONS) {
        await createIndex(client, indexOperation, envId, meta);
    }

    await createTtlIndex(client, envId, meta);
}

main().catch((error) => {
    console.error("[init-db] fail");
    console.error(error.code ? `${error.code}: ${error.message}` : error);
    process.exitCode = 1;
});
