//! SeaORM Entity. Generated by sea-orm-codegen 0.9.2

use super::sea_orm_active_enums::CheckpointUpdateType;
use sea_orm::entity::prelude::*;

#[derive(Copy, Clone, Default, Debug, DeriveEntity)]
pub struct Entity;

impl EntityName for Entity {
    fn table_name(&self) -> &str {
        "checkpoint_update"
    }
}

#[derive(Clone, Debug, PartialEq, DeriveModel, DeriveActiveModel)]
pub struct Model {
    pub id: i64,
    pub time_created: TimeDateTime,
    pub checkpoint_id: i64,
    pub update_type: CheckpointUpdateType,
    pub tx_id: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveColumn)]
pub enum Column {
    Id,
    TimeCreated,
    CheckpointId,
    UpdateType,
    TxId,
}

#[derive(Copy, Clone, Debug, EnumIter, DerivePrimaryKey)]
pub enum PrimaryKey {
    Id,
}

impl PrimaryKeyTrait for PrimaryKey {
    type ValueType = i64;
    fn auto_increment() -> bool {
        true
    }
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {
    Checkpoint,
    Transaction,
}

impl ColumnTrait for Column {
    type EntityName = Entity;
    fn def(&self) -> ColumnDef {
        match self {
            Self::Id => ColumnType::BigInteger.def(),
            Self::TimeCreated => ColumnType::DateTime.def(),
            Self::CheckpointId => ColumnType::BigInteger.def(),
            Self::UpdateType => CheckpointUpdateType::db_type(),
            Self::TxId => ColumnType::BigInteger.def(),
        }
    }
}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        match self {
            Self::Checkpoint => Entity::belongs_to(super::checkpoint::Entity)
                .from(Column::CheckpointId)
                .to(super::checkpoint::Column::Id)
                .into(),
            Self::Transaction => Entity::belongs_to(super::transaction::Entity)
                .from(Column::TxId)
                .to(super::transaction::Column::Id)
                .into(),
        }
    }
}

impl Related<super::checkpoint::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Checkpoint.def()
    }
}

impl Related<super::transaction::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Transaction.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
