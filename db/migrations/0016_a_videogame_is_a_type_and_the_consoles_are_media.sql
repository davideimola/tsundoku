-- A videogame is a Type, the consoles are media, and a game is credited to people (#62,
-- ADR-0021, ADR-0022).
--
-- **Four inserts and nothing else.** There is no DDL here and there was never going to be: the
-- whole argument of ADR-0021 is that a videogame is a **Story** by the test that decides what
-- one is — *a Story is what you would give a score to* — and that a Story owing no object to
-- anybody is the ordinary case this model has held since ADR-0001. So what a game needed was
-- vocabulary, and vocabulary is rows (ADR-0006). `drizzle-kit generate` will never write this
-- file for the reason it never wrote `0001`: rows are not schema (ADR-0009).
--
-- The four are what the door already asks for and could not yet be answered with. The
-- narrative half (ADR-0019) asks a title, a Type and a medium and creates no object; with
-- these rows standing, *Expedition 33, played on a PS5, an 8* is a Story, a Pass and a Rating
-- the library holds, and no screen was rebuilt to hold it.

-- **The seventh Type, at the end of the order.** The order is what a picker offers and not a
-- ranking, and the six before it are the ones the owner reads for most often.
insert into type (id, name, display_order) values
  ('videogame', 'Videogame', 7);

-- **The consoles the owner plays on**, after paper and digital because that is the order they
-- are offered in and the printed pair is what most of this library is.
--
-- **None of them goes through an object**, which is the same fact `digital` carries and for a
-- reason the owner has weighed and stated: a disc on the shelf says almost nothing worth
-- recording, so a videogame owns no Volume here (`CONTEXT.md`, ADR-0021). The door is not
-- closed — a boxed game is an ordinary Volume with a Binding of its own — it is simply not
-- walked through, and the flag is what makes the database say so rather than a comment.
--
-- **These three are the ones the owner owns**, which is the whole reason the Pile can answer
-- *can I start this tonight* without modelling hardware: a medium that needs no object needs
-- nothing (ADR-0022). So the list is a claim about the house, and it moves when the house
-- does — a fourth console is one insert in a file of its own, exactly as a seventh Binding
-- was, and taking one off is a delete no Pass has pointed at yet.
insert into medium (id, name, display_order, goes_through_an_object) values
  ('playstation-5',   'PlayStation 5',   3, false),
  ('nintendo-switch', 'Nintendo Switch', 4, false),
  ('pc',              'PC',              5, false);

-- **Two roles, and deliberately not four.** A Credit is indexed by person because the question
-- it answers is *what else did this one do* — what else Kojima directed, what else Mitsuda
-- wrote — and *director* and *composer* pass that test. A **studio** and a **publisher** do
-- not enter here at all, because neither is a person (`CONTEXT.md`, ADR-0021). Nothing refuses
-- them beyond their absence, which is what a vocabulary is: the row nobody wrote.
insert into credit_role (id, name, display_order) values
  ('director', 'Director', 3),
  ('composer', 'Composer', 4);
