// Prisma's `contains` becomes SQL `ILIKE '%<value>%'` WITHOUT escaping LIKE's special
// characters, so a search for "%" matched every row and "_" matched any character
// (found by a security test in Day 3, Task 4). Escaping them makes the search literal.
// Backslash is PostgreSQL's default LIKE escape character.
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

module.exports = escapeLike;
