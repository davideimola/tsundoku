import { relations } from "drizzle-orm/relations";
import { story, reading, provenance, volume, type, rating, editionNote, binding, series, credit, person, creditRole, path, declaredConstraint, wish, readingListPin, acquisition, volumeStory, pathItem } from "./schema";

export const readingRelations = relations(reading, ({one, many}) => ({
	story: one(story, {
		fields: [reading.storyId],
		references: [story.id]
	}),
	provenance: one(provenance, {
		fields: [reading.provenanceId],
		references: [provenance.id]
	}),
	volume: one(volume, {
		fields: [reading.volumeId],
		references: [volume.id]
	}),
	ratings: many(rating),
}));

export const storyRelations = relations(story, ({one, many}) => ({
	readings: many(reading),
	type: one(type, {
		fields: [story.typeId],
		references: [type.id]
	}),
	ratings: many(rating),
	credits: many(credit),
	volumeStories: many(volumeStory),
	pathItems: many(pathItem),
}));

export const provenanceRelations = relations(provenance, ({many}) => ({
	readings: many(reading),
	ratings: many(rating),
}));

export const volumeRelations = relations(volume, ({one, many}) => ({
	readings: many(reading),
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
	reading: one(reading, {
		fields: [rating.storyId],
		references: [reading.id]
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

export const seriesRelations = relations(series, ({many}) => ({
	volumes: many(volume),
	readingListPins: many(readingListPin),
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
	readingListPins: many(readingListPin),
	pathItems: many(pathItem),
}));

export const wishRelations = relations(wish, ({one}) => ({
	volume: one(volume, {
		fields: [wish.volumeId],
		references: [volume.id]
	}),
}));

export const readingListPinRelations = relations(readingListPin, ({one}) => ({
	path: one(path, {
		fields: [readingListPin.pathId],
		references: [path.id]
	}),
	series: one(series, {
		fields: [readingListPin.seriesId],
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