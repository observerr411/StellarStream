#![cfg(test)]

use crate::{Role, StellarStream, StellarStreamClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup_test() -> (Env, Address, StellarStreamClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    // Deploy contract
    let contract_id = env.register(StellarStream, ());
    let client = StellarStreamClient::new(&env, &contract_id);

    // Initialize with admin (grants all roles)
    client.initialize(&admin);

    (env, admin, client)
}

#[test]
fn test_initialize_grants_all_roles() {
    let (env, admin, client) = setup_test();

    // Verify admin has all roles
    assert!(client.check_role(&admin, &Role::Admin));
    assert!(client.check_role(&admin, &Role::Pauser));
    assert!(client.check_role(&admin, &Role::TreasuryManager));
}

#[test]
fn test_admin_can_grant_roles() {
    let (env, admin, client) = setup_test();

    let pauser = Address::generate(&env);
    let treasury_manager = Address::generate(&env);

    // Admin grants roles
    client.grant_role(&admin, &pauser, &Role::Pauser);
    client.grant_role(&admin, &treasury_manager, &Role::TreasuryManager);

    // Verify roles were granted
    assert!(client.check_role(&pauser, &Role::Pauser));
    assert!(client.check_role(&treasury_manager, &Role::TreasuryManager));

    // Verify they don't have other roles
    assert!(!client.check_role(&pauser, &Role::Admin));
    assert!(!client.check_role(&treasury_manager, &Role::Admin));
}

#[test]
fn test_admin_can_revoke_roles() {
    let (env, admin, client) = setup_test();

    let pauser = Address::generate(&env);

    // Grant then revoke
    client.grant_role(&admin, &pauser, &Role::Pauser);
    assert!(client.check_role(&pauser, &Role::Pauser));

    client.revoke_role(&admin, &pauser, &Role::Pauser);
    assert!(!client.check_role(&pauser, &Role::Pauser));
}

#[test]
#[should_panic(expected = "Unauthorized: Only Admin can grant roles")]
fn test_non_admin_cannot_grant_roles() {
    let (env, admin, client) = setup_test();

    let non_admin = Address::generate(&env);
    let target = Address::generate(&env);

    // Non-admin tries to grant role - should fail
    client.grant_role(&non_admin, &target, &Role::Pauser);
}

#[test]
#[should_panic(expected = "Unauthorized: Only Admin can revoke roles")]
fn test_non_admin_cannot_revoke_roles() {
    let (env, admin, client) = setup_test();

    let non_admin = Address::generate(&env);
    let pauser = Address::generate(&env);

    // Admin grants role first
    client.grant_role(&admin, &pauser, &Role::Pauser);

    // Non-admin tries to revoke - should fail
    client.revoke_role(&non_admin, &pauser, &Role::Pauser);
}

#[test]
fn test_pauser_can_pause() {
    let (env, admin, client) = setup_test();

    let pauser = Address::generate(&env);
    client.grant_role(&admin, &pauser, &Role::Pauser);

    // Pauser can pause
    client.set_pause(&pauser, &true);

    // Pauser can unpause
    client.set_pause(&pauser, &false);
}

#[test]
#[should_panic(expected = "Unauthorized: Only Pauser can pause/unpause")]
fn test_non_pauser_cannot_pause() {
    let (env, admin, client) = setup_test();

    let non_pauser = Address::generate(&env);

    // Non-pauser tries to pause - should fail
    client.set_pause(&non_pauser, &true);
}

#[test]
fn test_treasury_manager_can_update_fee() {
    let (env, admin, client) = setup_test();

    let treasury_manager = Address::generate(&env);
    client.grant_role(&admin, &treasury_manager, &Role::TreasuryManager);

    // Treasury manager can update fee
    client.update_fee(&treasury_manager, &200);
}

#[test]
#[should_panic(expected = "Unauthorized: Only TreasuryManager can update fee")]
fn test_non_treasury_manager_cannot_update_fee() {
    let (env, admin, client) = setup_test();

    let non_manager = Address::generate(&env);

    // Non-manager tries to update fee - should fail
    client.update_fee(&non_manager, &200);
}

#[test]
fn test_treasury_manager_can_update_treasury() {
    let (env, admin, client) = setup_test();

    let treasury_manager = Address::generate(&env);
    let new_treasury = Address::generate(&env);

    client.grant_role(&admin, &treasury_manager, &Role::TreasuryManager);

    // Treasury manager can update treasury address
    client.update_treasury(&treasury_manager, &new_treasury);
}

#[test]
#[should_panic(expected = "Unauthorized: Only TreasuryManager can update treasury")]
fn test_non_treasury_manager_cannot_update_treasury() {
    let (env, admin, client) = setup_test();

    let non_manager = Address::generate(&env);
    let new_treasury = Address::generate(&env);

    // Non-manager tries to update treasury - should fail
    client.update_treasury(&non_manager, &new_treasury);
}

#[test]
#[should_panic(expected = "Unauthorized: Only TreasuryManager can update fee")]
fn test_pauser_cannot_update_fees() {
    let (env, admin, client) = setup_test();

    let pauser = Address::generate(&env);
    client.grant_role(&admin, &pauser, &Role::Pauser);

    // Pauser can pause
    client.set_pause(&pauser, &true);

    // But pauser cannot update fees (should panic)
    client.update_fee(&pauser, &200);
}

#[test]
#[should_panic(expected = "Unauthorized: Only Pauser can pause/unpause")]
fn test_treasury_manager_cannot_pause() {
    let (env, admin, client) = setup_test();

    let treasury_manager = Address::generate(&env);
    client.grant_role(&admin, &treasury_manager, &Role::TreasuryManager);

    // Treasury manager can update fees
    client.update_fee(&treasury_manager, &200);

    // But cannot pause (should panic)
    client.set_pause(&treasury_manager, &true);
}

#[test]
fn test_multiple_addresses_can_have_same_role() {
    let (env, admin, client) = setup_test();

    let pauser1 = Address::generate(&env);
    let pauser2 = Address::generate(&env);

    // Grant Pauser role to multiple addresses
    client.grant_role(&admin, &pauser1, &Role::Pauser);
    client.grant_role(&admin, &pauser2, &Role::Pauser);

    // Both should have the role
    assert!(client.check_role(&pauser1, &Role::Pauser));
    assert!(client.check_role(&pauser2, &Role::Pauser));

    // Both can pause
    client.set_pause(&pauser1, &true);
    client.set_pause(&pauser2, &false);
}

#[test]
fn test_address_can_have_multiple_roles() {
    let (env, admin, client) = setup_test();

    let multi_role = Address::generate(&env);

    // Grant multiple roles to one address
    client.grant_role(&admin, &multi_role, &Role::Pauser);
    client.grant_role(&admin, &multi_role, &Role::TreasuryManager);

    // Verify both roles
    assert!(client.check_role(&multi_role, &Role::Pauser));
    assert!(client.check_role(&multi_role, &Role::TreasuryManager));

    // Can perform both actions
    client.set_pause(&multi_role, &true);
    client.update_fee(&multi_role, &150);
}

#[test]
fn test_role_separation() {
    let (env, admin, client) = setup_test();

    let pauser = Address::generate(&env);
    let treasury_manager = Address::generate(&env);

    client.grant_role(&admin, &pauser, &Role::Pauser);
    client.grant_role(&admin, &treasury_manager, &Role::TreasuryManager);

    // Pauser can pause but not manage treasury
    client.set_pause(&pauser, &true);

    // Treasury manager can manage fees but not pause
    client.update_fee(&treasury_manager, &250);

    // Verify role separation
    assert!(client.check_role(&pauser, &Role::Pauser));
    assert!(!client.check_role(&pauser, &Role::TreasuryManager));
    assert!(client.check_role(&treasury_manager, &Role::TreasuryManager));
    assert!(!client.check_role(&treasury_manager, &Role::Pauser));
}

#[test]
fn test_admin_retains_all_permissions() {
    let (env, admin, client) = setup_test();

    // Admin can do everything
    client.set_pause(&admin, &true);
    client.update_fee(&admin, &300);

    let new_admin = Address::generate(&env);
    client.grant_role(&admin, &new_admin, &Role::Admin);

    // All should succeed
}

#[test]
#[should_panic(expected = "Unauthorized: Only Pauser can pause/unpause")]
fn test_revoked_role_loses_permissions() {
    let (env, admin, client) = setup_test();

    let pauser = Address::generate(&env);
    client.grant_role(&admin, &pauser, &Role::Pauser);

    // Can pause
    client.set_pause(&pauser, &true);

    // Revoke role
    client.revoke_role(&admin, &pauser, &Role::Pauser);

    // Cannot pause anymore (should panic)
    client.set_pause(&pauser, &false);
}
