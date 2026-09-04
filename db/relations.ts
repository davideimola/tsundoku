import { relations } from "drizzle-orm/relations";
import { story, pass, provenance, volume, type, rating, editionNote, binding, series, credit, person, creditRole, path, declaredConstraint, wish, pilePin, acquisition, volumeStory, pathItem } from "./schema";

export const passRelations = relations(pass, ({one, many}) => ({
	story: one(story, {
		fields: [pass.storyId],
		references: [story.id]
	}),
	provenance: one(provenance, {
		fields: [pass.provenanceId],
		references: [provenance.id]
	}),
	volume: one(volume, {
		fields: [pass.volumeId],
		references: [volume.id]
	}),
	ratings: many(rating),
}));

export const storyRelations = relations(story, ({one, many}) => ({
	passes: many(pass),
	type: one(type, {
		fields: [story.typeId],
		references: [type.id]
	}),
	ratings: many(rating),
	credits: many(credit),
	volumeStories: many(volumeStory),
	pathItems: many(pathItem),
	series: many(series),
	pilePins: many(pilePin),
}));

export const provenanceRelations = relations(provenance, ({many}) => ({
	passes: many(pass),
	ratings: many(rating),
}));

export const volumeRelations = relations(volume, ({one, many}) => ({
	passes: many(pass),
	editionNotes: many(editionNote),
	binding: one(binding, {
		fields: [volume.bindingId],
		references: [binding.id]
	}),
	series: one(series, {
		fields: [volume.seriesId],
		references: [series.id]
	}),
	wishes: many(wish),
	acquisitions: many(acquisition),
	volumeStories: many(volumeStory),
}));

export const typeRelations = relations(type, ({many}) => ({
	stories: many(story),
}));

export const ratingRelations = relations(rating, ({one}) => ({
	story: one(story, {
		fields: [rating.storyId],
		references: [story.id]
	}),
	provenance: one(provenance, {
		fields: [rating.provenanceId],
		references: [provenance.id]
	}),
	pass: one(pass, {
		fields: [rating.storyId],
		references: [pass.id]
	}),
}));

export const editionNoteRelations = relations(editionNote, ({one}) => ({
	volume: one(volume, {
		fields: [editionNote.volumeId],
		references: [volume.id]
	}),
}));

export const bindingRelations = relations(binding, ({many}) => ({
	volumes: many(volume),
}));

export const seriesRelations = relations(series, ({one, many}) => ({
	volumes: many(volume),
	pilePins: many(pilePin),
	story: one(story, {
		fields: [series.storyId],
		references: [story.id]
	}),
}));

export const creditRelations = relations(credit, ({one}) => ({
	story: one(story, {
		fields: [credit.storyId],
		references: [story.id]
	}),
	person: one(person, {
		fields: [credit.personId],
		references: [person.id]
	}),
	creditRole: one(creditRole, {
		fields: [credit.roleId],
		references: [creditRole.id]
	}),
}));

export const personRelations = relations(person, ({many}) => ({
	credits: many(credit),
}));

export const creditRoleRelations = relations(creditRole, ({many}) => ({
	credits: many(credit),
}));

export const declaredConstraintRelations = relations(declaredConstraint, ({one}) => ({
	path: one(path, {
		fields: [declaredConstraint.pathId],
		references: [path.id]
	}),
}));

export const pathRelations = relations(path, ({many}) => ({
	declaredConstraints: many(declaredConstraint),
	pathItems: many(pathItem),
}));

export const wishRelations = relations(wish, ({one}) => ({
	volume: one(volume, {
		fields: [wish.volumeId],
		references: [volume.id]
	}),
}));

export const pilePinRelations = relations(pilePin, ({one}) => ({
	story: one(story, {
		fields: [pilePin.storyId],
		references: [story.id]
	}),
	series: one(series, {
		fields: [pilePin.seriesId],
		references: [series.id]
	}),
}));

export const acquisitionRelations = relations(acquisition, ({one}) => ({
	volume: one(volume, {
		fields: [acquisition.volumeId],
		references: [volume.id]
	}),
}));

export const volumeStoryRelations = relations(volumeStory, ({one}) => ({
	volume: one(volume, {
		fields: [volumeStory.volumeId],
		references: [volume.id]
	}),
	story: one(story, {
		fields: [volumeStory.storyId],
		references: [story.id]
	}),
}));

export const pathItemRelations = relations(pathItem, ({one}) => ({
	path: one(path, {
		fields: [pathItem.pathId],
		references: [path.id]
	}),
	story: one(story, {
		fields: [pathItem.storyId],
		references: [story.id]
	}),
}));

// The old names, for the one step in which the rest of the repository still says them.
// See the note at the foot of `db/schema.ts`: these are the same relations under the old
// words, and they go when nothing reaches for them.
export const readingRelations = passRelations;
export const readingListPinRelations = pilePinRelations;
