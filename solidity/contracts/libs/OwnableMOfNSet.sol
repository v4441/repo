// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

// ============ External Imports ============
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// ============ Internal Imports ============
import {EnumerableMOfNSet} from "./EnumerableMOfNSet.sol";
import {Message} from "./Message.sol";

contract OwnableMOfNSet is Ownable {
    // ============ Libraries ============

    using Message for bytes;

    // ============ Mutable Storage ============

    /// @notice The set for each remote domain.
    mapping(uint32 => EnumerableMOfNSet.AddressSet) private _sets;

    // ============ Events ============

    /**
     * @notice Emitted when a value is added to a set.
     * @param domain The remote domain of the set.
     * @param value The address of the value.
     * @param length The number of values in the set.
     */
    event ValueAdded(
        uint32 indexed domain,
        address indexed value,
        uint256 length
    );

    /**
     * @notice Emitted when a value is removed from a set.
     * @param domain The remote domain of the set.
     * @param value The address of the value.
     * @param length The number of values in the set.
     */
    event ValueRemoved(
        uint32 indexed domain,
        address indexed value,
        uint256 length
    );

    /**
     * @notice Emitted when the quorum threshold is set.
     * @param domain The remote domain of the set.
     * @param threshold The new quorum threshold.
     */
    event ThresholdSet(uint32 indexed domain, uint8 threshold);

    /**
     * @notice Emitted when the set or threshold changes.
     * @param domain The remote domain of the set.
     * @param commitment A commitment to the set and threshold.
     */
    event CommitmentUpdated(uint32 indexed domain, bytes32 commitment);

    // ============ Constructor ============

    // solhint-disable-next-line no-empty-blocks
    constructor() Ownable() {}

    // ============ External Functions ============

    /**
     * @notice Adds multiple values to multiple sets.
     * @dev Reverts if `_value` is already in the set.
     * @dev _values[i] are the values to add for _domains[i].
     * @param _domains The remote domains of the sets.
     * @param _values The values to add to the sets.
     */
    function addMany(uint32[] calldata _domains, address[][] calldata _values)
        external
        onlyOwner
    {
        require(_domains.length == _values.length, "!length");
        for (uint256 i = 0; i < _domains.length; i += 1) {
            uint32 _domain = _domains[i];
            EnumerableMOfNSet.AddressSet storage _set = _sets[_domain];
            uint256 _startLength = EnumerableMOfNSet.length(_set);
            EnumerableMOfNSet.add(_set, _values[i]);
            for (uint256 j = 0; j < _values[i].length; j += 1) {
                emit ValueAdded(_domain, _values[i][j], _startLength + j + 1);
            }
            emit CommitmentUpdated(_domain, _set.commitment);
        }
    }

    /**
     * @notice Adds a value into a set.
     * @dev Reverts if `_value` is already in the set.
     * @param _domain The remote domain of the set.
     * @param _value The value to add to the set.
     */
    function add(uint32 _domain, address _value) external onlyOwner {
        EnumerableMOfNSet.AddressSet storage _set = _sets[_domain];
        bytes32 _commitment = EnumerableMOfNSet.add(_set, _value);
        emit ValueAdded(_domain, _value, EnumerableMOfNSet.length(_set));
        emit CommitmentUpdated(_domain, _commitment);
    }

    /**
     * @notice Removes a value from a set.
     * @dev Reverts if `_value` is not in the set.
     * @param _domain The remote domain of the set.
     * @param _value The value to remove from the set.
     */
    function remove(uint32 _domain, address _value) external onlyOwner {
        EnumerableMOfNSet.AddressSet storage _set = _sets[_domain];
        bytes32 _commitment = EnumerableMOfNSet.remove(_set, _value);
        emit ValueRemoved(_domain, _value, EnumerableMOfNSet.length(_set));
        emit CommitmentUpdated(_domain, _commitment);
    }

    /**
     * @notice Sets the quorum threshold for multiple domains.
     * @param _domains The remote domains of the sets.
     * @param _thresholds The new quorum thresholds.
     */
    function setThresholds(
        uint32[] calldata _domains,
        uint8[] calldata _thresholds
    ) external onlyOwner {
        require(_domains.length == _thresholds.length, "!length");
        for (uint256 i = 0; i < _domains.length; i += 1) {
            setThreshold(_domains[i], _thresholds[i]);
        }
    }

    /**
     * @notice Returns whether an address is contained in a set.
     * @param _domain The remote domain of the set.
     * @param _value The address to test for set membership.
     * @return True if the address is contained, false otherwise.
     */
    function contains(uint32 _domain, address _value)
        external
        view
        returns (bool)
    {
        return EnumerableMOfNSet.contains(_sets[_domain], _value);
    }

    // ============ Public Functions ============

    /**
     * @notice Sets the quorum threshold.
     * @param _domain The remote domain of the set.
     * @param _threshold The new quorum threshold.
     */
    function setThreshold(uint32 _domain, uint8 _threshold) public onlyOwner {
        EnumerableMOfNSet.AddressSet storage _set = _sets[_domain];
        bytes32 _commitment = EnumerableMOfNSet.setThreshold(_set, _threshold);
        emit ThresholdSet(_domain, _threshold);
        emit CommitmentUpdated(_domain, _commitment);
    }

    /**
     * @notice Gets the current set
     * @param _domain The remote domain of the set.
     * @return The addresses of the set.
     */
    function values(uint32 _domain) public view returns (address[] memory) {
        return EnumerableMOfNSet.values(_sets[_domain]);
    }

    /**
     * @notice Gets the current threshold
     * @param _domain The remote domain of the set.
     * @return The threshold of the set.
     */
    function threshold(uint32 _domain) public view returns (uint8) {
        return _sets[_domain].threshold;
    }

    /**
     * @notice Returns the number of values contained in the set.
     * @param _domain The remote domain of the set.
     * @return The number of values contained in the set.
     */
    function length(uint32 _domain) public view returns (uint256) {
        return EnumerableMOfNSet.length(_sets[_domain]);
    }

    /**
     * @notice Returns whether or not the provided set matches the set for
     * `_domain`
     * @param _domain The remote domain of the set.
     * @param _threshold The threshold of the set to check equality
     * @param _values The values of the set to check equality
     * @return Whether or not the two sets match
     */
    function setMatches(
        uint32 _domain,
        uint8 _threshold,
        bytes calldata _values
    ) public view returns (bool) {
        return EnumerableMOfNSet.matches(_sets[_domain], _threshold, _values);
    }

    /**
     * @notice Returns the set of values in the specified set
     * and the threshold
     * @param _domain The remote domain of the set.
     * @return values The array of value addresses
     * @return threshold The threshold of the set
     */
    function valuesAndThreshold(uint32 _domain)
        public
        view
        returns (address[] memory, uint8)
    {
        return EnumerableMOfNSet.valuesAndThreshold(_sets[_domain]);
    }
}
