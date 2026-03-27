import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /instruments/search', () => {
    it('should return an empty array when query is empty', () => {
      return request(app.getHttpServer())
        .get('/instruments/search?q=')
        .expect(200)
        .expect([]);
    });

    it('should return results matching a known ticker', () => {
      return request(app.getHttpServer())
        .get('/instruments/search?q=PAMP')
        .expect(200)
        .then((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0]).toHaveProperty('ticker');
          expect(res.body[0]).toHaveProperty('lastPrice');
        });
    });
  });

  describe('GET /portfolio/:userId', () => {
    it('should return portfolio for a valid user', () => {
      return request(app.getHttpServer())
        .get('/portfolio/1')
        .expect(200)
        .then((res) => {
          expect(res.body).toHaveProperty('totalAccountValue');
          expect(res.body).toHaveProperty('availableCash');
          expect(res.body).toHaveProperty('positions');
          expect(Array.isArray(res.body.positions)).toBe(true);
        });
    });
  });

  describe('POST /orders', () => {
    it('should return 400 when body is missing required fields', () => {
      return request(app.getHttpServer())
        .post('/orders')
        .send({ userId: 1 })
        .expect(400);
    });

    it('should return 400 for invalid enum values', () => {
      return request(app.getHttpServer())
        .post('/orders')
        .send({
          userId: 1,
          instrumentId: 47,
          side: 'INVALID',
          type: 'MARKET',
          quantity: 5,
        })
        .expect(400);
    });
  });

  describe('PATCH /orders/:id/cancel', () => {
    it('should return 404 for a non-existent order', () => {
      return request(app.getHttpServer())
        .patch('/orders/999999/cancel')
        .expect(404);
    });
  });
});
