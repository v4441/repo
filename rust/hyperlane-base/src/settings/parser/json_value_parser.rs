use std::str::FromStr;

use convert_case::{Case, Casing};
use derive_new::new;
use eyre::{eyre, Context};
use hyperlane_core::{config::*, utils::hex_or_base58_to_h256, H256};
use serde::de::{DeserializeOwned, StdError};
use serde_json::Value;

pub use super::super::envs::*;

/// A serde-json value config parsing utility.
#[derive(Debug, Clone, new)]
pub struct ValueParser<'v> {
    /// Path to the current value from the root.
    pub cwp: ConfigPath,
    /// Reference to the serde JSON value.
    pub val: &'v Value,
}

impl<'v> ValueParser<'v> {
    /// Get a value at the given key and verify that it is present.
    pub fn get_key(&self, key: &str) -> ConfigResult<ValueParser<'v>> {
        self.get_opt_key(key)?
            .ok_or_else(|| eyre!("Expected key `{key}` to be defined"))
            .into_config_result(|| &self.cwp + key.to_case(Case::Snake))
    }

    /// Get a value at the given key allowing for it to not be set.
    pub fn get_opt_key(&self, key: &str) -> ConfigResult<Option<ValueParser<'v>>> {
        let cwp = &self.cwp + key.to_case(Case::Snake);
        match self.val {
            Value::Object(obj) => Ok(obj.get(key).map(|val| Self {
                val,
                cwp: cwp.clone(),
            })),
            _ => Err(eyre!("Expected an object type")),
        }
        .into_config_result(|| cwp)
    }

    /// Create an iterator over all (key, value) tuples.
    pub fn into_obj_iter(
        self,
    ) -> ConfigResult<impl Iterator<Item = (String, ValueParser<'v>)> + 'v> {
        let cwp = self.cwp.clone();
        match self.val {
            Value::Object(obj) => Ok(obj.iter().map(move |(k, v)| {
                (
                    k.clone(),
                    Self {
                        val: v,
                        cwp: &cwp + k.to_case(Case::Snake),
                    },
                )
            })),
            _ => Err(eyre!("Expected an object type")),
        }
        .into_config_result(|| self.cwp)
    }

    /// Create an iterator over all array elements.
    pub fn into_array_iter(self) -> ConfigResult<impl Iterator<Item = ValueParser<'v>>> {
        let cwp = self.cwp.clone();
        match self.val {
            Value::Array(arr) => Ok(arr.iter().enumerate().map(move |(i, v)| Self {
                val: v,
                cwp: &cwp + i.to_string(),
            })),
            _ => Err(eyre!("Expected an array type")),
        }
        .into_config_result(|| self.cwp)
    }

    /// Parse a u64 value allowing for it to be represented as string or number.
    pub fn parse_u64(&self) -> ConfigResult<u64> {
        match self.val {
            Value::Number(num) => num
                .as_u64()
                .ok_or_else(|| eyre!("Excepted an unsigned integer, got number `{num}`")),
            Value::String(s) => s
                .parse()
                .with_context(|| format!("Expected an unsigned integer, got string `{s}`")),
            _ => Err(eyre!("Expected an unsigned integer, got `{:?}`", self.val)),
        }
        .into_config_result(|| self.cwp.clone())
    }

    /// Parse an i64 value allowing for it to be represented as string or number.
    pub fn parse_i64(&self) -> ConfigResult<i64> {
        match self.val {
            Value::Number(num) => num
                .as_i64()
                .ok_or_else(|| eyre!("Excepted a signed integer, got number `{num}`")),
            Value::String(s) => s
                .parse()
                .with_context(|| format!("Expected a signed integer, got string `{s}`")),
            _ => Err(eyre!("Expected an signed integer, got `{:?}`", self.val)),
        }
        .into_config_result(|| self.cwp.clone())
    }

    /// Parse an f64 value allowing for it to be represented as string or number and verifying it is
    /// not nan or infinite.
    pub fn parse_f64(&self) -> ConfigResult<f64> {
        let num = self.parse_f64_unchecked()?;
        if num.is_nan() {
            Err(eyre!("Expected a floating point number, got NaN"))
        } else if num.is_infinite() {
            Err(eyre!("Expected a floating point number, got Infinity"))
        } else {
            Ok(num)
        }
        .into_config_result(|| self.cwp.clone())
    }

    /// Parse an i64 value allowing for it to be represented as string or number.
    pub fn parse_f64_unchecked(&self) -> ConfigResult<f64> {
        match self.val {
            Value::Number(num) => num
                .as_f64()
                .ok_or_else(|| eyre!("Excepted a floating point number, got number `{num}`")),
            Value::String(s) => s
                .parse()
                .with_context(|| format!("Expected a floating point number, got string `{s}`")),
            _ => Err(eyre!(
                "Expected floating point number, got `{:?}`",
                self.val
            )),
        }
        .into_config_result(|| self.cwp.clone())
    }

    /// Parse a u32 value allowing for it to be represented as string or number.
    pub fn parse_u32(&self) -> ConfigResult<u32> {
        self.parse_u64()?
            .try_into()
            .context("Expected a 32-bit unsigned integer")
            .into_config_result(|| self.cwp.clone())
    }

    /// Parse a u16 value allowing for it to be represented as string or number.
    pub fn parse_u16(&self) -> ConfigResult<u16> {
        self.parse_u64()?
            .try_into()
            .context("Expected a 16-bit unsigned integer")
            .into_config_result(|| self.cwp.clone())
    }

    /// Parse an i32 value allowing for it to be represented as string or number.
    pub fn parse_i32(&self) -> ConfigResult<i32> {
        self.parse_i64()?
            .try_into()
            .context("Expected a 32-bit signed integer")
            .into_config_result(|| self.cwp.clone())
    }

    /// Parse a string value.
    pub fn parse_string(&self) -> ConfigResult<&'v str> {
        match self.val {
            Value::String(s) => Ok(s.as_str()),
            _ => Err(eyre!("Expected a string, got `{:?}`", self.val)),
        }
        .into_config_result(|| self.cwp.clone())
    }

    /// Parse an address hash allowing for it to be represented as a hex or base58 string.
    pub fn parse_address_hash(&self) -> ConfigResult<H256> {
        match self.val {
            Value::String(s) => {
                hex_or_base58_to_h256(s).context("Expected a valid address hash in hex or base58")
            }
            _ => Err(eyre!("Expected an address string, got `{:?}`", self.val)),
        }
        .into_config_result(|| self.cwp.clone())
    }

    /// Parse a private key allowing for it to be represented as a hex or base58 string.
    pub fn parse_private_key(&self) -> ConfigResult<H256> {
        match self.val {
            Value::String(s) => {
                hex_or_base58_to_h256(s).context("Expected a valid private key in hex or base58")
            }
            _ => Err(eyre!("Expected a private key string")),
        }
        .into_config_result(|| self.cwp.clone())
    }

    /// Use serde to parse a value.
    pub fn parse_value<T: DeserializeOwned>(&self, ctx: &'static str) -> ConfigResult<T> {
        serde_json::from_value(self.val.clone())
            .context(ctx)
            .into_config_result(|| self.cwp.clone())
    }

    /// Use `FromStr`/`str::parse` to parse a value.
    pub fn parse_from_str<T>(&self, ctx: &'static str) -> ConfigResult<T>
    where
        T: FromStr,
        T::Err: StdError + Send + Sync + 'static,
    {
        self.parse_string()?
            .parse()
            .context(ctx)
            .into_config_result(|| self.cwp.clone())
    }
}
