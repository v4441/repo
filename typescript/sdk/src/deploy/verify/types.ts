export type ContractVerificationInput = {
  name: string;
  address: string;
  constructorArguments?: string; // abi-encoded bytes
  isProxy?: boolean;
};

export type VerificationInput = ContractVerificationInput[];

export type CompilerOptions = {
  codeformat: 'solidity-single-file' | 'solidity-standard-json-input'; //solidity-single-file (default) or solidity-standard-json-input (for std-input-json-format support
  compilerversion: string; // see https://etherscan.io/solcversions for list of support versions
  optimizationUsed: '0' | '1'; //0 = No Optimization, 1 = Optimization used (applicable when codeformat=solidity-single-file)
  runs?: string; //set to 200 as default unless otherwise  (applicable when codeformat=solidity-single-file)
  licenseType:
    | '1'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | '10'
    | '11'
    | '12'
    | '13'
    | '14'; // integer from 1-14, see https://etherscan.io/contract-license-types
};
