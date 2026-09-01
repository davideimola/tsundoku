import { pgTable, text, timestamp, index, foreignKey, unique, check, uuid, date, integer, numeric, uniqueIndex, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const reading = pgTable("reading", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storyId: uuid("story_id").notNull(),
	medium: text().notNull(),
	outcome: text(),
	startedOn: date("started_on"),
	endedOn: date("ended_on"),
	provenanceId: text("provenance_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	volumeId: uuid("volume_id"),
}, (table) => [
	index("reading_by_story").using("btree", table.storyId.asc().nullsLast(), table.startedOn.desc().nullsLast()),
	foreignKey({
			columns: [table.storyId],
			foreignColumns: [story.id],
			name: "reading_story_exists"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.provenanceId],
			foreignColumns: [provenance.id],
			name: "reading_provenance_exists"
		}),
	foreignKey({
			columns: [table.volumeId],
			foreignColumns: [volume.id],
			name: "reading_volume_exists"
		}).onDelete("set null"),
	unique("reading_id_and_story").on(table.id, table.storyId),
	check("reading_digital_went_through_no_volume", sql`(volume_id IS NULL) OR (medium = 'paper'::text)`),
	check("reading_medium_is_paper_or_digital", sql`medium = ANY (ARRAY['paper'::text, 'digital'::text])`),
	check("reading_outcome_is_finished_or_abandoned", sql`(outcome IS NULL) OR (outcome = ANY (ARRAY['finished'::text, 'abandoned'::text]))`),
	check("reading_unconcluded_has_not_ended", sql`(outcome IS NOT NULL) OR (ended_on IS NULL)`),
	check("reading_did_not_end_before_it_started", sql`(started_on IS NULL) OR (ended_on IS NULL) OR (ended_on >= started_on)`),
]);

export const type = pgTable("type", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	displayOrder: integer("display_order").notNull(),
}, (table) => [
	unique("type_name_key").on(table.name),
	unique("type_display_order_key").on(table.displayOrder),
	check("type_id_is_a_slug", sql`id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text`),
	check("type_name_is_not_blank", sql`(name = btrim(name)) AND (name <> ''::text)`),
	check("type_display_order_is_positive", sql`display_order > 0`),
]);

export const story = pgTable("story", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	typeId: text("type_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("story_by_type").using("btree", table.typeId.asc().nullsLast()),
	foreignKey({
			columns: [table.typeId],
			foreignColumns: [type.id],
			name: "story_type_exists"
		}),
	check("story_title_is_not_blank", sql`(title = btrim(title)) AND (title <> ''::text)`),
]);

export const provenance = pgTable("provenance", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	description: text().notNull(),
	displayOrder: integer("display_order").notNull(),
}, (table) => [
	unique("provenance_name_key").on(table.name),
	unique("provenance_display_order_key").on(table.displayOrder),
	check("provenance_id_is_a_slug", sql`id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text`),
	check("provenance_name_is_not_blank", sql`(name = btrim(name)) AND (name <> ''::text)`),
	check("provenance_description_is_not_blank", sql`(description = btrim(description)) AND (description <> ''::text)`),
	check("provenance_display_order_is_positive", sql`display_order > 0`),
]);

export const binding = pgTable("binding", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	displayOrder: integer("display_order").notNull(),
}, (table) => [
	unique("binding_name_key").on(table.name),
	unique("binding_display_order_key").on(table.displayOrder),
	check("binding_id_is_a_slug", sql`id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text`),
	check("binding_name_is_not_blank", sql`(name = btrim(name)) AND (name <> ''::text)`),
	check("binding_display_order_is_positive", sql`display_order > 0`),
]);

export const rating = pgTable("rating", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storyId: uuid("story_id").notNull(),
	readingId: uuid("reading_id"),
	score: numeric().notNull(),
	prose: text(),
	provenanceId: text("provenance_id").notNull(),
	setAt: timestamp("set_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	scale: text().notNull(),
}, (table) => [
	index("rating_by_story").using("btree", table.storyId.asc().nullsLast(), table.setAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.storyId],
			foreignColumns: [story.id],
			name: "rating_story_exists"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.provenanceId],
			foreignColumns: [provenance.id],
			name: "rating_provenance_exists"
		}),
	foreignKey({
			columns: [table.storyId, table.readingId],
			foreignColumns: [reading.id, reading.storyId],
			name: "rating_belongs_to_the_read_story"
		}).onDelete("set null"),
	unique("rating_is_one_per_story_and_reading").on(table.storyId, table.readingId).nullsNotDistinct(),
	check("rating_score_is_one_to_ten", sql`(score >= (1)::numeric) AND (score <= (10)::numeric)`),
	check("rating_score_is_in_half_points", sql`(score * (2)::numeric) = trunc((score * (2)::numeric))`),
	check("rating_prose_is_not_blank", sql`(prose IS NULL) OR (btrim(prose) <> ''::text)`),
	check("rating_scale_is_coarse_or_half_points", sql`scale = ANY (ARRAY['coarse'::text, 'half-points'::text])`),
]);

export const editionNote = pgTable("edition_note", {
	volumeId: uuid("volume_id").primaryKey().notNull(),
	note: text().notNull(),
	writtenAt: timestamp("written_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.volumeId],
			foreignColumns: [volume.id],
			name: "edition_note_volume_exists"
		}).onDelete("cascade"),
	check("edition_note_is_not_blank", sql`(note = btrim(note)) AND (note <> ''::text)`),
]);

export const series = pgTable("series", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	publisher: text().notNull(),
	editionLine: text("edition_line"),
	publishedCount: integer("published_count").notNull(),
	status: text().notNull(),
	collectingSince: date("collecting_since"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("series_is_one_per_edition_line").on(table.name, table.publisher, table.editionLine).nullsNotDistinct(),
	check("series_name_is_not_blank", sql`(name = btrim(name)) AND (name <> ''::text)`),
	check("series_publisher_is_not_blank", sql`(publisher = btrim(publisher)) AND (publisher <> ''::text)`),
	check("series_edition_line_is_not_blank", sql`(edition_line IS NULL) OR ((edition_line = btrim(edition_line)) AND (edition_line <> ''::text))`),
	check("series_published_count_is_not_negative", sql`published_count >= 0`),
	check("series_status_is_ongoing_or_concluded", sql`status = ANY (ARRAY['ongoing'::text, 'concluded'::text])`),
]);

export const creditRole = pgTable("credit_role", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	displayOrder: integer("display_order").notNull(),
}, (table) => [
	unique("credit_role_name_key").on(table.name),
	unique("credit_role_display_order_key").on(table.displayOrder),
	check("credit_role_id_is_a_slug", sql`id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text`),
	check("credit_role_name_is_not_blank", sql`(name = btrim(name)) AND (name <> ''::text)`),
	check("credit_role_display_order_is_positive", sql`display_order > 0`),
]);

export const volume = pgTable("volume", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	publisher: text().notNull(),
	editionLine: text("edition_line"),
	bindingId: text("binding_id").notNull(),
	language: text().notNull(),
	isbn: text(),
	seriesId: uuid("series_id"),
	seriesNumber: integer("series_number"),
	coverSource: text("cover_source"),
	coverReference: text("cover_reference"),
	coverUrl: text("cover_url"),
	coverInfoUrl: text("cover_info_url"),
	coverLookedUpAt: timestamp("cover_looked_up_at", { withTimezone: true, mode: 'string' }),
	ownImageUrl: text("own_image_url"),
}, (table) => [
	foreignKey({
			columns: [table.bindingId],
			foreignColumns: [binding.id],
			name: "volume_binding_id_fkey"
		}),
	foreignKey({
			columns: [table.seriesId],
			foreignColumns: [series.id],
			name: "volume_series_exists"
		}),
	check("volume_title_is_not_blank", sql`(title = btrim(title)) AND (title <> ''::text)`),
	check("volume_publisher_is_not_blank", sql`(publisher = btrim(publisher)) AND (publisher <> ''::text)`),
	check("volume_edition_line_is_not_blank", sql`(edition_line IS NULL) OR ((edition_line = btrim(edition_line)) AND (edition_line <> ''::text))`),
	check("volume_language_is_a_code", sql`language ~ '^[a-z]{2,3}(-[a-z0-9]+)*$'::text`),
	check("volume_isbn_is_ten_or_thirteen_characters", sql`(isbn IS NULL) OR (isbn ~ '^[0-9]{9}[0-9Xx]$|^[0-9]{13}$'::text)`),
	check("volume_in_a_series_has_a_number", sql`(series_id IS NULL) = (series_number IS NULL)`),
	check("volume_series_number_is_positive", sql`(series_number IS NULL) OR (series_number > 0)`),
	check("volume_cover_is_a_source_and_a_url_together", sql`(cover_source IS NULL) = (cover_url IS NULL)`),
	check("volume_cover_source_is_one_this_app_looks_up", sql`(cover_source IS NULL) OR (cover_source = ANY (ARRAY['google-books'::text, 'open-library'::text]))`),
	check("volume_cover_is_hotlinked_and_never_hosted", sql`(cover_url IS NULL) OR (cover_url ~ '^https://((bks[0-9]+\\.)?books\\.google\\.com|covers\\.openlibrary\\.org)/'::text)`),
	check("volume_cover_was_looked_up", sql`(cover_url IS NULL) OR (cover_looked_up_at IS NOT NULL)`),
	check("volume_cover_reference_and_link_come_with_a_cover", sql`(cover_url IS NOT NULL) OR ((cover_reference IS NULL) AND (cover_info_url IS NULL))`),
	check("volume_own_image_is_the_owners_own", sql`(own_image_url IS NULL) OR ((own_image_url ~ '^https://[^ ]+$'::text) AND (own_image_url !~ '^https://((bks[0-9]+\\.)?books\\.google\\.com|covers\\.openlibrary\\.org)/'::text))`),
]);

export const credit = pgTable("credit", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storyId: uuid("story_id").notNull(),
	personId: uuid("person_id").notNull(),
	roleId: text("role_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("credit_by_person").using("btree", table.personId.asc().nullsLast()),
	index("credit_by_story").using("btree", table.storyId.asc().nullsLast()),
	foreignKey({
			columns: [table.storyId],
			foreignColumns: [story.id],
			name: "credit_story_exists"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [person.id],
			name: "credit_person_exists"
		}),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [creditRole.id],
			name: "credit_role_exists"
		}),
	unique("credit_is_one_role_per_person_per_story").on(table.storyId, table.personId, table.roleId),
]);

export const person = pgTable("person", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("person_is_named_once").using("btree", sql`lower(name)`),
	check("person_name_is_not_blank", sql`(name = btrim(name)) AND (name <> ''::text)`),
]);

export const path = pgTable("path", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	intent: text(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("path_name_names_one_route").using("btree", sql`lower(name)`),
	check("path_name_is_not_blank", sql`(name = btrim(name)) AND (name <> ''::text)`),
	check("path_intent_is_not_blank", sql`(intent IS NULL) OR (btrim(intent) <> ''::text)`),
]);

export const declaredConstraint = pgTable("declared_constraint", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pathId: uuid("path_id"),
	prose: text().notNull(),
	declaredAt: timestamp("declared_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("declared_constraint_by_path").using("btree", table.pathId.asc().nullsLast(), table.declaredAt.asc().nullsLast()),
	foreignKey({
			columns: [table.pathId],
			foreignColumns: [path.id],
			name: "declared_constraint_path_exists"
		}).onDelete("cascade"),
	check("declared_constraint_prose_is_not_blank", sql`(prose = btrim(prose)) AND (prose <> ''::text)`),
]);

export const wish = pgTable("wish", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	volumeId: uuid("volume_id").notNull(),
	priority: integer().notNull(),
	targetPrice: numeric("target_price", { precision: 10, scale:  2 }),
	priceFound: numeric("price_found", { precision: 10, scale:  2 }),
	shop: text(),
	openedOn: date("opened_on").default(sql`CURRENT_DATE`).notNull(),
	closedOn: date("closed_on"),
}, (table) => [
	uniqueIndex("wish_one_open_per_volume").using("btree", table.volumeId.asc().nullsLast()).where(sql`(closed_on IS NULL)`),
	foreignKey({
			columns: [table.volumeId],
			foreignColumns: [volume.id],
			name: "wish_volume_id_fkey"
		}),
	check("wish_priority_is_one_to_three", sql`(priority >= 1) AND (priority <= 3)`),
	check("wish_target_price_is_not_negative", sql`(target_price IS NULL) OR (target_price >= (0)::numeric)`),
	check("wish_price_found_is_not_negative", sql`(price_found IS NULL) OR (price_found >= (0)::numeric)`),
	check("wish_shop_is_not_blank", sql`(shop IS NULL) OR ((shop = btrim(shop)) AND (shop <> ''::text))`),
	check("wish_close_follows_open", sql`(closed_on IS NULL) OR (closed_on >= opened_on)`),
]);

export const readingListPin = pgTable("reading_list_pin", {
	pathId: uuid("path_id"),
	seriesId: uuid("series_id"),
	pinnedAt: timestamp("pinned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("reading_list_pin_one_per_path").using("btree", table.pathId.asc().nullsLast()).where(sql`(path_id IS NOT NULL)`),
	uniqueIndex("reading_list_pin_one_per_series").using("btree", table.seriesId.asc().nullsLast()).where(sql`(series_id IS NOT NULL)`),
	foreignKey({
			columns: [table.pathId],
			foreignColumns: [path.id],
			name: "reading_list_pin_path_exists"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.seriesId],
			foreignColumns: [series.id],
			name: "reading_list_pin_series_exists"
		}).onDelete("cascade"),
	check("reading_list_pin_has_one_subject", sql`(path_id IS NULL) <> (series_id IS NULL)`),
]);

export const inboxEntry = pgTable("inbox_entry", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reported: text().notNull(),
	act: text().default('create').notNull(),
	proposes: text().notNull(),
	reference: text().notNull(),
	subjectId: uuid("subject_id"),
	details: jsonb().default({}).notNull(),
	proposedAt: timestamp("proposed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	outcome: text(),
	createdId: uuid("created_id"),
}, (table) => [
	check("inbox_entry_reported_is_not_blank", sql`(reported = btrim(reported)) AND (reported <> ''::text)`),
	check("inbox_entry_reference_is_not_blank", sql`(reference = btrim(reference)) AND (reference <> ''::text)`),
	check("inbox_entry_act_is_create_or_amend", sql`act = ANY (ARRAY['create'::text, 'amend'::text])`),
	check("inbox_entry_proposes_a_story_volume_or_series", sql`proposes = ANY (ARRAY['story'::text, 'volume'::text, 'series'::text])`),
	check("inbox_entry_details_is_a_document", sql`jsonb_typeof(details) = 'object'::text`),
	check("inbox_entry_outcome_is_approved_or_rejected", sql`(outcome IS NULL) OR (outcome = ANY (ARRAY['approved'::text, 'rejected'::text]))`),
	check("inbox_entry_is_decided_once", sql`(decided_at IS NULL) = (outcome IS NULL)`),
	check("inbox_entry_an_amendment_names_what_it_amends", sql`(subject_id IS NOT NULL) = (act = 'amend'::text)`),
	check("inbox_entry_approved_creation_names_what_it_created", sql`(created_id IS NOT NULL) = ((act = 'create'::text) AND (NOT (outcome IS DISTINCT FROM 'approved'::text)))`),
]);

export const acquisition = pgTable("acquisition", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	volumeId: uuid("volume_id").notNull(),
	acquiredOn: date("acquired_on"),
	releasedOn: date("released_on"),
	pricePaid: numeric("price_paid", { precision: 10, scale:  2 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("acquisition_by_volume").using("btree", table.volumeId.asc().nullsLast(), table.releasedOn.asc().nullsLast()),
	uniqueIndex("acquisition_one_open_per_volume").using("btree", table.volumeId.asc().nullsLast()).where(sql`(released_on IS NULL)`),
	foreignKey({
			columns: [table.volumeId],
			foreignColumns: [volume.id],
			name: "acquisition_volume_exists"
		}),
	check("acquisition_price_paid_is_not_negative", sql`(price_paid IS NULL) OR (price_paid >= (0)::numeric)`),
	check("acquisition_release_follows_acquisition", sql`(released_on IS NULL) OR (acquired_on IS NULL) OR (released_on >= acquired_on)`),
]);

export const volumeStory = pgTable("volume_story", {
	volumeId: uuid("volume_id").notNull(),
	storyId: uuid("story_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("volume_story_by_story").using("btree", table.storyId.asc().nullsLast()),
	foreignKey({
			columns: [table.volumeId],
			foreignColumns: [volume.id],
			name: "volume_story_volume_exists"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.storyId],
			foreignColumns: [story.id],
			name: "volume_story_story_exists"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.volumeId, table.storyId], name: "volume_story_is_said_once"}),
]);

export const pathItem = pgTable("path_item", {
	pathId: uuid("path_id").notNull(),
	storyId: uuid("story_id").notNull(),
	position: numeric().notNull(),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("path_item_in_order").using("btree", table.pathId.asc().nullsLast(), table.position.asc().nullsLast()),
	foreignKey({
			columns: [table.pathId],
			foreignColumns: [path.id],
			name: "path_item_path_exists"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.storyId],
			foreignColumns: [story.id],
			name: "path_item_story_exists"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.pathId, table.storyId], name: "path_item_is_one_stop"}),
	unique("path_item_position_is_one_place").on(table.pathId, table.position),
	check("path_item_position_is_positive", sql`"position" > (0)::numeric`),
]);

export const want = pgTable("want", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storyId: uuid("story_id").notNull(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("want_newest_first").using("btree", table.openedAt.desc().nullsLast()),
	foreignKey({
			columns: [table.storyId],
			foreignColumns: [story.id],
			name: "want_story_exists"
		}).onDelete("cascade"),
	unique("want_one_open_per_story").on(table.storyId),
]);
