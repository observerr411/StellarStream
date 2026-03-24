use soroban_sdk::{Address, Env};

/// Get voting power for a stream
/// Returns the unlocked balance that can be used for voting
#[allow(dead_code)]
pub fn get_voting_power(_env: &Env, stream: &crate::types::Stream, current_time: u64) -> i128 {
    if stream.cancelled {
        return 0;
    }

    // Calculate unlocked amount
    let unlocked = if current_time < stream.start_time {
        0
    } else if current_time >= stream.end_time {
        stream.total_amount
    } else {
        let elapsed = (current_time - stream.start_time) as i128;
        let duration = (stream.end_time - stream.start_time) as i128;
        (stream.total_amount * elapsed) / duration
    };

    // Return unlocked minus already withdrawn
    unlocked - stream.withdrawn_amount
}

/// Get total stream balance (locked + unlocked)
#[allow(dead_code)]
pub fn get_total_balance(stream: &crate::types::Stream) -> i128 {
    if stream.cancelled {
        return 0;
    }
    stream.total_amount - stream.withdrawn_amount
}

/// Check if address has delegation rights for a stream
#[allow(dead_code)]
pub fn can_delegate(env: &Env, stream_id: u64, caller: &Address) -> bool {
    let receipt: crate::types::StreamReceipt = env
        .storage()
        .instance()
        .get(&(crate::storage::RECEIPT, stream_id))
        .unwrap_or_else(|| panic!("Stream not found"));

    receipt.owner == *caller
}
