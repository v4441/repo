#!/usr/bin/env bash

# Optional cleanup for previous runs, useful when running locally
pkill -f anvil
docker ps -aq | xargs docker stop | xargs docker rm
rm -rf /tmp/anvil*
rm -rf /tmp/relayer

# Setup directories for anvil chains
for CHAIN in anvil1 anvil2
do
    mkdir -p /tmp/$CHAIN /tmp/$CHAIN/state  /tmp/$CHAIN/validator /tmp/relayer
    chmod -R 777 /tmp/relayer /tmp/$CHAIN
done

# Optional: remove the --block-time 1 to speedup tests for local runs
anvil --chain-id 31337 -p 8545 --state /tmp/anvil1/state > /dev/null &
anvil --chain-id 31338 -p 8555 --state /tmp/anvil2/state > /dev/null &
sleep 1

set -e

echo "{}" > /tmp/empty-artifacts.json

export DEBUG=hyperlane:*

echo "Deploying contracts to anvil1 and anvil2"
yarn workspace @hyperlane-xyz/cli run hyperlane deploy core \
    --chain-configs ./examples/anvil-chains.yaml \
    --chains anvil1,anvil2 \
    --artifacts /tmp/empty-artifacts.json \
    --out /tmp \
    --ism ./examples/multisig-ism.yaml \
    --hook ./examples/hook-config.yaml \
    --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
    --yes

CORE_ARTIFACTS_PATH=`find /tmp/core-deployment* -type f -exec ls -t1 {} + | head -1`
echo "Core artifacts:"
echo $CORE_ARTIFACTS_PATH

AGENT_CONFIG_FILENAME=`ls -t1 /tmp | grep agent-config | head -1`

echo "Deploying warp routes"
yarn workspace @hyperlane-xyz/cli run hyperlane deploy warp \
    --chains ./examples/anvil-chains.yaml \
    --core $CORE_ARTIFACTS_PATH \
    --config ./examples/warp-tokens.yaml \
    --out /tmp \
    --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
    --yes

echo "Sending test message"
yarn workspace @hyperlane-xyz/cli run hyperlane send message \
    --origin anvil1 \
    --destination anvil2 \
    --chains ./examples/anvil-chains.yaml \
    --core $CORE_ARTIFACTS_PATH \
    --quick \
    --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
    | tee /tmp/message1

MESSAGE1_ID=`cat /tmp/message1 | grep "Message ID" | grep -E -o '0x[0-9a-f]+'`
echo "Message 1 ID: $MESSAGE1_ID"

WARP_ARTIFACTS_FILE=`find /tmp/warp-deployment* -type f -exec ls -t1 {} + | head -1`
ANVIL1_ROUTER=`cat $WARP_ARTIFACTS_FILE | jq -r ".anvil1.router"`

echo "Sending test warp transfer"
yarn workspace @hyperlane-xyz/cli run hyperlane send transfer \
    --origin anvil1 \
    --destination anvil2 \
    --chains ./examples/anvil-chains.yaml \
    --core $CORE_ARTIFACTS_PATH \
    --router $ANVIL1_ROUTER \
    --type native \
    --quick \
    --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
    | tee /tmp/message2

MESSAGE2_ID=`cat /tmp/message2 | grep "Message ID" | grep -E -o '0x[0-9a-f]+'`
echo "Message 2 ID: $MESSAGE2_ID"

ANVIL_CONNECTION_URL="http://127.0.0.1"
cd ../../rust
for i in "anvil1 8545 ANVIL1" "anvil2 8555 ANVIL2"
do
    set -- $i
    echo "Running validator on $1"

    export CONFIG_FILES=/tmp/${AGENT_CONFIG_FILENAME}
    export HYP_ORIGINCHAINNAME=$1
    export HYP_CHAINS_${3}_BLOCKS_REORGPERIOD=0
    export HYP_VALIDATOR_INTERVAL=1
    export HYP_CHAINS_${3}_CUSTOMRPCURLS=${ANVIL_CONNECTION_URL}:${2}
    export HYP_VALIDATOR_TYPE=hexKey
    export HYP_VALIDATOR_KEY=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
    export HYP_CHECKPOINTSYNCER_TYPE=localStorage
    export HYP_CHECKPOINTSYNCER_PATH=/tmp/${1}/validator
    export HYP_TRACING_LEVEL=debug
    export HYP_TRACING_FMT=compact

    cargo run --bin validator > /tmp/${1}/validator-logs.txt &

done

echo "Validator running, sleeping to let it sync"
sleep 15
echo "Done sleeping"

echo "Validator Announcement:"
cat /tmp/anvil1/validator/announcement.json

echo "Running relayer"

export HYP_RELAYCHAINS=anvil1,anvil2
export HYP_ALLOWLOCALCHECKPOINTSYNCERS=true 
export HYP_DB=/data/relayer
export HYP_GASPAYMENTENFORCEMENT='[{"type":"none"}]'
export HYP_CHAINS_ANVIL1_SIGNER_TYPE=hexKey
export HYP_CHAINS_ANVIL1_SIGNER_TYPE=0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97
export HYP_CHAINS_ANVIL2_SIGNER_TYPE=hexKey
export HYP_CHAINS_ANVIL2_SIGNER_TYPE=0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97 

cargo run --bin relayer > /tmp/relayer/relayer-logs.txt &

sleep 10
echo "Done running relayer, checking message delivery statuses"

for i in "1 $MESSAGE1_ID" "2 $MESSAGE2_ID"
do
    set -- $i
    echo "Checking delivery status of $1: $2"
    yarn workspace @hyperlane-xyz/cli run hyperlane status \
        --id $2 \
        --destination anvil2 \
        --chains ./examples/anvil-chains.yaml \
        --core $CORE_ARTIFACTS_PATH \
        | tee /tmp/message-status-$1
    if ! grep -q "$2 was delivered" /tmp/message-status-$1; then
        echo "ERROR: Message $1 was not delivered"
        exit 1
    else
        echo "Message $1 was delivered!"
    fi
done

docker ps -aq | xargs docker stop | xargs docker rm
pkill -f anvil
