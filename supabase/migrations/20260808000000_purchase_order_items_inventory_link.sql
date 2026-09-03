-- Link a purchase order line to the inventory item it restocks.
--
-- Receiving a PO credits stock to an inventory item. Without this column the only
-- way to work out which item a line refers to is to match the composite label
-- stored in item_name ("Shoes · 7 · black"), which breaks as soon as an item is
-- renamed or two items share a label. The PO form already captured the item id;
-- it simply had nowhere to be stored.
--
-- Additive and nullable: existing rows keep working via label matching, and the
-- application inserts without this column when it is absent.

DO $$
BEGIN
  IF to_regclass('public.purchase_order_items') IS NULL THEN
    RAISE NOTICE 'Skipping: purchase_order_items does not exist.';
    RETURN;
  END IF;

  -- text, NOT uuid: inventory_items.id is a text column holding UUID strings
  -- (the client generates them with crypto.randomUUID()). Declaring this uuid
  -- makes the foreign key below unimplementable — "key columns are of
  -- incompatible types: uuid and text".
  ALTER TABLE public.purchase_order_items
    ADD COLUMN IF NOT EXISTS inventory_item_id text;

  -- Only add the foreign key when the target table exists and the constraint has
  -- not already been created. ON DELETE SET NULL keeps the order history intact
  -- if an inventory item is later removed — a PO is a financial record and must
  -- not disappear with its stock item.
  IF to_regclass('public.inventory_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'purchase_order_items_inventory_item_id_fkey'
         AND conrelid = 'public.purchase_order_items'::regclass
     )
  THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_inventory_item_id_fkey
      FOREIGN KEY (inventory_item_id)
      REFERENCES public.inventory_items (id)
      ON DELETE SET NULL;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_po_items_inventory_item
    ON public.purchase_order_items (inventory_item_id);
END $$;

COMMENT ON COLUMN public.purchase_order_items.inventory_item_id IS
  'Inventory item this line restocks. Used to credit stock when goods are received; falls back to matching item_name for rows created before this column existed.';

-- Idempotency note for goods receipt
-- --------------------------------------------------------------------------
-- Stock posting derives how much it still owes from the ledger: it sums
-- stock_transactions.quantity where transaction_type = 'purchase' and
-- reference = the PO number, then posts only the difference against
-- received_quantity. This index supports that lookup.
DO $$
BEGIN
  IF to_regclass('public.stock_transactions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stock_txn_reference_type
      ON public.stock_transactions (reference, transaction_type);
  END IF;
END $$;
