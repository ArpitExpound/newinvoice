import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Box,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  Center,
  Button,
  HStack,
  useToast,
} from "@chakra-ui/react";

const API_BASE_URL = "http://localhost:4004/rest/billing-document/getBillingDocument";
const ITEMS_PER_PAGE = 10; // Number of rows per page

function BillingDocumentTable() {
  const [billingDocument, setBillingDocument] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const toast = useToast();

  const fetchBillingDocument = () => {
    setLoading(true);
    axios
      .get(API_BASE_URL)
      .then((res) => setBillingDocument(res.data.value || res.data))
      .catch((err) => {
        toast({
          title: "Error fetching billingDocument",
          description: err.message,
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBillingDocument();
  }, []);

  const totalPages = Math.ceil(billingDocument.length / ITEMS_PER_PAGE);
  const paginatedData = billingDocument.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handlePrev = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const handleNext = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));

  return (
    <Box p={6} bg="gray.100" minH="100vh">
      {/* Page Header */}
      <Box
        bg="white"
        p={4}
        mb={6}
        boxShadow="sm"
        borderRadius="md"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
      >
        <Heading fontSize="2xl" color="blue.600">
          Billing Document List
        </Heading>
      </Box>

      {/* Table */}
      <Box
        p={6}
        bg="white"
        boxShadow="md"
        borderRadius="md"
        borderWidth="1px"
        borderColor="gray.200"
        overflowX="auto"
      >
        {loading ? (
          <Center><Spinner size="xl" color="blue.500" /></Center>
        ) : (
          <>
            <Table size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Billing ID</Th>
                  <Th>Billing Date</Th>
                  <Th>Document Type</Th>
                  <Th>Company Code</Th>
                  <Th>Fiscal Year</Th>
                  <Th>Sales Org</Th>
                  <Th>Division</Th>
                  <Th>Distribution Channel</Th>
                  <Th>Sold To Party</Th>
                  <Th>Customer Name</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paginatedData.map((doc) => (
                  <Tr key={doc.BillingDocument }>
                    <Td>{doc.BillingDocument}</Td>
                    <Td>{doc.BillingDocumentDate}</Td>
                    <Td>{doc.BillingDocumentType}</Td>
                    <Td>{doc.CompanyCode}</Td>
                    <Td>{doc.FiscalYear}</Td>
                    <Td>{doc.SalesOrganization}</Td>
                    <Td>{doc.Division}</Td>
                    <Td>{doc.DistributionChannel}</Td>
                    <Td>{doc.SoldToParty}</Td>
                    <Td>{doc.CustomerName}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {/* Pagination */}
            <HStack spacing={4} mt={4} justify="center">
              <Button onClick={handlePrev} disabled={currentPage === 1}>
                Previous
              </Button>
              <Box>
                Page {currentPage} of {totalPages}
              </Box>
              <Button onClick={handleNext} disabled={currentPage === totalPages}>
                Next
              </Button>
            </HStack>
          </>
        )}
      </Box>
    </Box>
  );
}

export default BillingDocumentTable;
