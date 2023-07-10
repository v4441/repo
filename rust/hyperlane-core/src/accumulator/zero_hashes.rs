use crate::H256;

/// Tree depth
pub const TREE_DEPTH: usize = 32;
// keccak256 zero hashes
const Z_0: H256 = H256([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const Z_1: H256 = H256([
    173, 50, 40, 182, 118, 247, 211, 205, 66, 132, 165, 68, 63, 23, 241, 150, 43, 54, 228, 145,
    179, 10, 64, 178, 64, 88, 73, 229, 151, 186, 95, 181,
]);
const Z_2: H256 = H256([
    180, 193, 25, 81, 149, 124, 111, 143, 100, 44, 74, 246, 28, 214, 178, 70, 64, 254, 198, 220,
    127, 198, 7, 238, 130, 6, 169, 158, 146, 65, 13, 48,
]);
const Z_3: H256 = H256([
    33, 221, 185, 163, 86, 129, 92, 63, 172, 16, 38, 182, 222, 197, 223, 49, 36, 175, 186, 219, 72,
    92, 155, 165, 163, 227, 57, 138, 4, 183, 186, 133,
]);
const Z_4: H256 = H256([
    229, 135, 105, 179, 42, 27, 234, 241, 234, 39, 55, 90, 68, 9, 90, 13, 31, 182, 100, 206, 45,
    211, 88, 231, 252, 191, 183, 140, 38, 161, 147, 68,
]);
const Z_5: H256 = H256([
    14, 176, 30, 191, 201, 237, 39, 80, 12, 212, 223, 201, 121, 39, 45, 31, 9, 19, 204, 159, 102,
    84, 13, 126, 128, 5, 129, 17, 9, 225, 207, 45,
]);
const Z_6: H256 = H256([
    136, 124, 34, 189, 135, 80, 211, 64, 22, 172, 60, 102, 181, 255, 16, 45, 172, 221, 115, 246,
    176, 20, 231, 16, 181, 30, 128, 34, 175, 154, 25, 104,
]);
const Z_7: H256 = H256([
    255, 215, 1, 87, 228, 128, 99, 252, 51, 201, 122, 5, 15, 127, 100, 2, 51, 191, 100, 108, 201,
    141, 149, 36, 198, 185, 43, 207, 58, 181, 111, 131,
]);
const Z_8: H256 = H256([
    152, 103, 204, 95, 127, 25, 107, 147, 186, 225, 226, 126, 99, 32, 116, 36, 69, 210, 144, 242,
    38, 56, 39, 73, 139, 84, 254, 197, 57, 247, 86, 175,
]);
const Z_9: H256 = H256([
    206, 250, 212, 229, 8, 192, 152, 185, 167, 225, 216, 254, 177, 153, 85, 251, 2, 186, 150, 117,
    88, 80, 120, 113, 9, 105, 211, 68, 15, 80, 84, 224,
]);
const Z_10: H256 = H256([
    249, 220, 62, 127, 224, 22, 224, 80, 239, 242, 96, 51, 79, 24, 165, 212, 254, 57, 29, 130, 9,
    35, 25, 245, 150, 79, 46, 46, 183, 193, 195, 165,
]);
const Z_11: H256 = H256([
    248, 177, 58, 73, 226, 130, 246, 9, 195, 23, 168, 51, 251, 141, 151, 109, 17, 81, 124, 87, 29,
    18, 33, 162, 101, 210, 90, 247, 120, 236, 248, 146,
]);
const Z_12: H256 = H256([
    52, 144, 198, 206, 235, 69, 10, 236, 220, 130, 226, 130, 147, 3, 29, 16, 199, 215, 59, 248, 94,
    87, 191, 4, 26, 151, 54, 10, 162, 197, 217, 156,
]);
const Z_13: H256 = H256([
    193, 223, 130, 217, 196, 184, 116, 19, 234, 226, 239, 4, 143, 148, 180, 211, 85, 76, 234, 115,
    217, 43, 15, 122, 249, 110, 2, 113, 198, 145, 226, 187,
]);
const Z_14: H256 = H256([
    92, 103, 173, 215, 198, 202, 243, 2, 37, 106, 222, 223, 122, 177, 20, 218, 10, 207, 232, 112,
    212, 73, 163, 164, 137, 247, 129, 214, 89, 232, 190, 204,
]);
const Z_15: H256 = H256([
    218, 123, 206, 159, 78, 134, 24, 182, 189, 47, 65, 50, 206, 121, 140, 220, 122, 96, 231, 225,
    70, 10, 114, 153, 227, 198, 52, 42, 87, 150, 38, 210,
]);
const Z_16: H256 = H256([
    39, 51, 229, 15, 82, 110, 194, 250, 25, 162, 43, 49, 232, 237, 80, 242, 60, 209, 253, 249, 76,
    145, 84, 237, 58, 118, 9, 162, 241, 255, 152, 31,
]);
const Z_17: H256 = H256([
    225, 211, 181, 200, 7, 178, 129, 228, 104, 60, 198, 214, 49, 92, 249, 91, 154, 222, 134, 65,
    222, 252, 179, 35, 114, 241, 193, 38, 227, 152, 239, 122,
]);
const Z_18: H256 = H256([
    90, 45, 206, 10, 138, 127, 104, 187, 116, 86, 15, 143, 113, 131, 124, 44, 46, 187, 203, 247,
    255, 251, 66, 174, 24, 150, 241, 63, 124, 116, 121, 160,
]);
const Z_19: H256 = H256([
    180, 106, 40, 182, 245, 85, 64, 248, 148, 68, 246, 61, 224, 55, 142, 61, 18, 27, 224, 158, 6,
    204, 157, 237, 28, 32, 230, 88, 118, 211, 106, 160,
]);
const Z_20: H256 = H256([
    198, 94, 150, 69, 100, 71, 134, 182, 32, 226, 221, 42, 214, 72, 221, 252, 191, 74, 126, 91, 26,
    58, 78, 207, 231, 246, 70, 103, 163, 240, 183, 226,
]);
const Z_21: H256 = H256([
    244, 65, 133, 136, 237, 53, 162, 69, 140, 255, 235, 57, 185, 61, 38, 241, 141, 42, 177, 59,
    220, 230, 174, 229, 142, 123, 153, 53, 158, 194, 223, 217,
]);
const Z_22: H256 = H256([
    90, 156, 22, 220, 0, 214, 239, 24, 183, 147, 58, 111, 141, 198, 92, 203, 85, 102, 113, 56, 119,
    111, 125, 234, 16, 16, 112, 220, 135, 150, 227, 119,
]);
const Z_23: H256 = H256([
    77, 248, 79, 64, 174, 12, 130, 41, 208, 214, 6, 158, 92, 143, 57, 167, 194, 153, 103, 122, 9,
    211, 103, 252, 123, 5, 227, 188, 56, 14, 230, 82,
]);
const Z_24: H256 = H256([
    205, 199, 37, 149, 247, 76, 123, 16, 67, 208, 225, 255, 186, 183, 52, 100, 140, 131, 141, 251,
    5, 39, 217, 113, 182, 2, 188, 33, 108, 150, 25, 239,
]);
const Z_25: H256 = H256([
    10, 191, 90, 201, 116, 161, 237, 87, 244, 5, 10, 165, 16, 221, 156, 116, 245, 8, 39, 123, 57,
    215, 151, 59, 178, 223, 204, 197, 238, 176, 97, 141,
]);
const Z_26: H256 = H256([
    184, 205, 116, 4, 111, 243, 55, 240, 167, 191, 44, 142, 3, 225, 15, 100, 44, 24, 134, 121, 141,
    113, 128, 106, 177, 232, 136, 217, 229, 238, 135, 208,
]);
const Z_27: H256 = H256([
    131, 140, 86, 85, 203, 33, 198, 203, 131, 49, 59, 90, 99, 17, 117, 223, 244, 150, 55, 114, 204,
    233, 16, 129, 136, 179, 74, 200, 124, 129, 196, 30,
]);
const Z_28: H256 = H256([
    102, 46, 228, 221, 45, 215, 178, 188, 112, 121, 97, 177, 230, 70, 196, 4, 118, 105, 220, 182,
    88, 79, 13, 141, 119, 13, 175, 93, 126, 125, 235, 46,
]);
const Z_29: H256 = H256([
    56, 138, 178, 14, 37, 115, 209, 113, 168, 129, 8, 231, 157, 130, 14, 152, 242, 108, 11, 132,
    170, 139, 47, 74, 164, 150, 141, 187, 129, 142, 163, 34,
]);
const Z_30: H256 = H256([
    147, 35, 124, 80, 186, 117, 238, 72, 95, 76, 34, 173, 242, 247, 65, 64, 11, 223, 141, 106, 156,
    199, 223, 126, 202, 229, 118, 34, 22, 101, 215, 53,
]);
const Z_31: H256 = H256([
    132, 72, 129, 139, 180, 174, 69, 98, 132, 158, 148, 158, 23, 172, 22, 224, 190, 22, 104, 142,
    21, 107, 92, 241, 94, 9, 140, 98, 124, 0, 86, 169,
]);
const Z_32: H256 = H256([
    39, 174, 91, 160, 141, 114, 145, 201, 108, 140, 189, 220, 193, 72, 191, 72, 166, 214, 140, 121,
    116, 185, 67, 86, 245, 55, 84, 239, 97, 113, 215, 87,
]);

pub const ZERO_HASHES: [H256; TREE_DEPTH + 1] = [
    Z_0, Z_1, Z_2, Z_3, Z_4, Z_5, Z_6, Z_7, Z_8, Z_9, Z_10, Z_11, Z_12, Z_13, Z_14, Z_15, Z_16,
    Z_17, Z_18, Z_19, Z_20, Z_21, Z_22, Z_23, Z_24, Z_25, Z_26, Z_27, Z_28, Z_29, Z_30, Z_31, Z_32,
];
