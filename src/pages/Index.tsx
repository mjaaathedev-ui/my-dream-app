import React from 'react';
import { Container, Jumbotron, Button } from 'react-bootstrap';

const Index = () => {
  return (
    <Container fluid>
      <Jumbotron className="text-center">
        <h1>Welcome to My Dream App!</h1>
        <p>Your one-stop solution for all your needs.</p>
        <Button variant="primary" href="/signup">Get Started</Button>
      </Jumbotron>
    </Container>
  );
};

export default Index;
