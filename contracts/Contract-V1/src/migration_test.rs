#![cfg(test)]

use crate::{LegacyStream, StellarStream, StellarStreamClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup_test() -> (Env, Address, StellarStreamClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(StellarStream, ());
    let client = StellarStreamClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    (env, admin, client)
}

#[test]
fn test_initial_version_is_one() {
    let (_env, _admin, client) = setup_test();

    let version = client.get_version();
    assert_eq!(version, 1, "Initial version should be 1");
}

#[test]
fn test_migrate_updates_version() {
    let (env, admin, client) = setup_test();

    // Set stream count to 0 for simple test
    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage().instance().set(&DataKey::StreamId, &0u64);
    });

    // Run migration
    client.migrate(&admin, &2);

    // Verify version updated
    let version = client.get_version();
    assert_eq!(version, 2, "Version should be updated to 2");
}

#[test]
#[should_panic(expected = "Migration for version 2 has already been executed")]
fn test_migration_cannot_run_twice() {
    let (env, admin, client) = setup_test();

    // Set stream count to 0 for simple test
    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage().instance().set(&DataKey::StreamId, &0u64);
    });

    // Run migration first time
    client.migrate(&admin, &2);

    // Try to run again - should panic
    client.migrate(&admin, &2);
}

#[test]
#[should_panic(expected = "Unauthorized: Only admin can run migrations")]
fn test_non_admin_cannot_migrate() {
    let (env, _admin, client) = setup_test();

    let non_admin = Address::generate(&env);

    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage().instance().set(&DataKey::StreamId, &0u64);
    });

    // Try to migrate as non-admin - should panic
    client.migrate(&non_admin, &2);
}

#[test]
#[should_panic(expected = "Target version must be greater than current version")]
fn test_cannot_migrate_backwards() {
    let (env, admin, client) = setup_test();

    // First migrate to v2
    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage().instance().set(&DataKey::StreamId, &0u64);
    });

    client.migrate(&admin, &2);

    // Try to migrate to v1 - should panic
    client.migrate(&admin, &1);
}

#[test]
fn test_migration_with_no_streams() {
    let (env, admin, client) = setup_test();

    // Set stream count to 0
    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage().instance().set(&DataKey::StreamId, &0u64);
    });

    // Should not panic, just update version
    client.migrate(&admin, &2);

    let version = client.get_version();
    assert_eq!(version, 2);
}

#[test]
fn test_migrate_single_stream() {
    let (env, admin, client) = setup_test();

    let legacy_stream = LegacyStream {
        sender: Address::generate(&env),
        receiver: Address::generate(&env),
        token: Address::generate(&env),
        amount: 5000,
        start_time: 500,
        end_time: 1000,
        withdrawn_amount: 100,
    };

    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(42), &legacy_stream);
    });

    // Migrate single stream
    client.migrate_single_stream(&admin, &42);

    // Function executes successfully
}

#[test]
#[should_panic(expected = "Unauthorized: Only admin can migrate streams")]
fn test_non_admin_cannot_migrate_single_stream() {
    let (env, _admin, client) = setup_test();

    let non_admin = Address::generate(&env);

    let legacy_stream = LegacyStream {
        sender: Address::generate(&env),
        receiver: Address::generate(&env),
        token: Address::generate(&env),
        amount: 1000,
        start_time: 100,
        end_time: 200,
        withdrawn_amount: 0,
    };

    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(1), &legacy_stream);
    });

    // Try to migrate as non-admin - should panic
    client.migrate_single_stream(&non_admin, &1);
}

#[test]
fn test_get_version_query() {
    let (env, admin, client) = setup_test();

    // Initial version
    assert_eq!(client.get_version(), 1);

    // After migration
    env.as_contract(&client.address, || {
        use crate::types::DataKey;
        env.storage().instance().set(&DataKey::StreamId, &0u64);
    });

    client.migrate(&admin, &2);
    assert_eq!(client.get_version(), 2);
}

#[test]
fn test_migration_framework_exists() {
    let (_env, _admin, client) = setup_test();

    // Verify migration functions are callable
    let version = client.get_version();
    assert!(version >= 1, "Version tracking works");
}
