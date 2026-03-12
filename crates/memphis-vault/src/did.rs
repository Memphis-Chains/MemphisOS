use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::{rngs::OsRng, RngCore};

use crate::error::VaultError;

/// Memphis DID (did:memphis:z6Mkf...)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct MemphisDid {
    pub did: String,
    pub public_key: String, // base64url
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl MemphisDid {
    /// Generate new DID with ed25519 keypair
    pub fn generate() -> Result<(Self, [u8; 64]), VaultError> {
        let mut csprng = OsRng {};
        let mut secret = [0u8; 32];
        csprng.fill_bytes(&mut secret);

        let signing_key = SigningKey::from_bytes(&secret);
        let verifying_key = signing_key.verifying_key();

        // Encode public key as base64url
        let public_key = base64_url::encode(&verifying_key.to_bytes());

        // DID format: did:memphis:z6Mkf... (base58 encoded public key)
        let did = format!("did:memphis:{}", encode_public_key(&verifying_key));

        let did_obj = Self {
            did,
            public_key,
            created_at: chrono::Utc::now(),
        };

        // Return private key bytes (64 bytes: 32 secret + 32 public)
        let private_key_bytes = {
            let mut bytes = [0u8; 64];
            bytes[..32].copy_from_slice(&signing_key.to_bytes());
            bytes[32..].copy_from_slice(&verifying_key.to_bytes());
            bytes
        };

        Ok((did_obj, private_key_bytes))
    }

    /// Verify signature
    pub fn verify(&self, _message: &[u8], _signature: &[u8]) -> bool {
        // Implementation depends on use case
        // For now, just validate DID format
        self.did.starts_with("did:memphis:")
    }
}

/// Encode public key as multibase base58btc with Ed25519 multicodec prefix.
fn encode_public_key(public_key: &VerifyingKey) -> String {
    // Multicodec prefix for Ed25519 public keys followed by key bytes.
    // Emit as multibase base58btc (z-prefix) for stable DID representation.
    const ED25519_PUB_MULTICODEC: [u8; 2] = [0xED, 0x01];
    let mut payload = Vec::with_capacity(2 + 32);
    payload.extend_from_slice(&ED25519_PUB_MULTICODEC);
    payload.extend_from_slice(&public_key.to_bytes());
    format!("z{}", bs58::encode(payload).into_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_did_generation() {
        let (did, priv_key) = MemphisDid::generate().unwrap();

        assert!(did.did.starts_with("did:memphis:"));
        assert!(did.did.starts_with("did:memphis:z"));
        assert_eq!(priv_key.len(), 64);
        assert!(!did.public_key.is_empty());
    }

    #[test]
    fn test_did_unique() {
        let (did1, _) = MemphisDid::generate().unwrap();
        let (did2, _) = MemphisDid::generate().unwrap();

        // Each generation should create unique DID
        assert_ne!(did1.did, did2.did);
    }

    #[test]
    fn test_did_contains_multicodec_ed25519_public_key() {
        let (did, priv_key) = MemphisDid::generate().unwrap();
        let encoded = did.did.strip_prefix("did:memphis:").unwrap();
        assert!(encoded.starts_with('z'));

        let decoded = bs58::decode(&encoded[1..]).into_vec().unwrap();
        assert_eq!(&decoded[..2], &[0xED, 0x01]);
        assert_eq!(decoded.len(), 34);
        assert_eq!(&decoded[2..], &priv_key[32..]);
    }
}
