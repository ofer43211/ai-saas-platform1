// Example unit test
// Unit tests focus on testing individual functions/methods in isolation

describe('Example Unit Tests', () => {
  describe('Calculator', () => {
    it('should add two numbers correctly', () => {
      const result = 2 + 2;
      expect(result).toBe(4);
    });

    it('should multiply two numbers correctly', () => {
      const result = 3 * 4;
      expect(result).toBe(12);
    });
  });

  describe('String utilities', () => {
    it('should convert string to uppercase', () => {
      const result = 'hello'.toUpperCase();
      expect(result).toBe('HELLO');
    });

    it('should trim whitespace', () => {
      const result = '  hello  '.trim();
      expect(result).toBe('hello');
    });
  });

  describe('Array operations', () => {
    it('should filter array correctly', () => {
      const numbers = [1, 2, 3, 4, 5];
      const evens = numbers.filter((n) => n % 2 === 0);
      expect(evens).toEqual([2, 4]);
    });

    it('should map array correctly', () => {
      const numbers = [1, 2, 3];
      const doubled = numbers.map((n) => n * 2);
      expect(doubled).toEqual([2, 4, 6]);
    });
  });
});
